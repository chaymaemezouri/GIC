import { Router } from 'express';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { nextReference } from '../lib/references.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { upload, uploadExcel } from '../lib/upload.js';
import {
  importProjectRows,
  parseCsvProjectRows,
  parseExcelProjectRows,
} from '../lib/importProjects.js';
import { sendExcel } from '../lib/exportExcel.js';

function buildPropertyWhere(q: string, status: string, projectId: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q } },
              { reference: { contains: q } },
              { city: { contains: q } },
              { titleNumber: { contains: q } },
            ],
          }
        : {},
      status ? { status } : {},
      projectId ? { projectId } : {},
    ],
  };
}

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

// --- Localisations ---
router.get('/locations', async (_req, res) => {
  res.json(await prisma.location.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { projects: true } } } }));
});

router.post('/locations', async (req, res) => {
  const loc = await prisma.location.create({ data: req.body });
  res.status(201).json(loc);
});

function normalizeProjectOwnershipType(v: unknown) {
  const s = String(v || 'personnel').trim().toLowerCase();
  return s === 'client' ? 'client' : 'personnel';
}

function buildProjectWhere(q: string, status: string, locationId: string, ownershipType = '') {
  return {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q } },
              { reference: { contains: q } },
              { city: { contains: q } },
              { address: { contains: q } },
              { description: { contains: q } },
            ],
          }
        : {},
      status ? { status } : {},
      locationId ? { locationId } : {},
      ownershipType ? { ownershipType: normalizeProjectOwnershipType(ownershipType) } : {},
    ],
  };
}

async function backfillProjectReferences() {
  const rows = await prisma.project.findMany({
    where: { reference: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const p of rows) {
    const reference = await nextReference('PRJ');
    await prisma.project.update({ where: { id: p.id }, data: { reference } });
  }
}

backfillProjectReferences().catch(() => {});

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

// --- Projets (routes spécifiques avant :id générique) ---
router.get('/projects/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const locationId = String(req.query.locationId || '');
  const ownershipType = String(req.query.ownershipType || '');
  const where = buildProjectWhere(q, status, locationId, ownershipType);
  const projects = await prisma.project.findMany({
    where,
    include: { location: true, client: { select: { id: true, firstName: true, lastName: true, reference: true } }, _count: { select: { properties: true, tranches: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const header = 'Référence;Nom;Type;Client;Ville;Adresse;Localisation;Statut;Tranches;Biens;Description;Remarque';
  const ownershipLabel = (t?: string | null) => (t === 'client' ? 'Client' : 'Personnel (GIC)');
  const clientLabel = (p: { client?: { firstName: string; lastName: string; reference: string } | null }) =>
    p.client ? `${p.client.firstName} ${p.client.lastName} (${p.client.reference})` : '';
  const rows = projects.map(
    (p) =>
      `${p.reference || ''};${p.name};${ownershipLabel(p.ownershipType)};${clientLabel(p)};${p.city || ''};${(p.address || '').replace(/;/g, ',')};${p.location?.name || ''};${p.status};${p._count.tranches};${p._count.properties};${(p.description || '').replace(/;/g, ',')};${(p.remark || '').replace(/;/g, ',')}`
  );
  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=projets-gic.csv');
  res.send('\uFEFF' + csv);
});

router.post('/projects/import/csv', async (req, res) => {
  const csv = String(req.body?.csv || '').trim();
  if (!csv) return res.status(400).json({ message: 'Contenu CSV requis' });
  const result = await importProjectRows(parseCsvProjectRows(csv));
  await audit(req, 'import_csv', 'Project', undefined, `${result.created} créés`);
  res.json(result);
});

router.post('/projects/import/xlsx', uploadExcel.single('file'), async (req, res) => {
  if (!req.file?.buffer) return res.status(400).json({ message: 'Fichier Excel (.xlsx) requis' });
  const rows = parseExcelProjectRows(req.file.buffer);
  if (!rows.length) return res.status(400).json({ message: 'Fichier vide ou format non reconnu' });
  const result = await importProjectRows(rows);
  await audit(req, 'import_xlsx', 'Project', undefined, `${result.created} créés`);
  res.json(result);
});

router.get('/projects/stats', async (_req, res) => {
  const [total, actifs, inactifs, personnel, clientProjects, biens, tranches] = await Promise.all([
    prisma.project.count(),
    prisma.project.count({ where: { status: 'actif' } }),
    prisma.project.count({ where: { status: 'inactif' } }),
    prisma.project.count({ where: { ownershipType: 'personnel' } }),
    prisma.project.count({ where: { ownershipType: 'client' } }),
    prisma.property.count(),
    prisma.tranche.count(),
  ]);
  res.json({ total, actifs, inactifs, personnel, clientProjects, biens, tranches });
});

router.get('/projects', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const locationId = String(req.query.locationId || '');
  const ownershipType = String(req.query.ownershipType || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const orderBy =
    sort === 'name'
      ? { name: order as 'asc' | 'desc' }
      : sort === 'city'
        ? { city: order as 'asc' | 'desc' }
        : sort === 'reference'
          ? { reference: order as 'asc' | 'desc' }
          : { createdAt: order as 'asc' | 'desc' };

  const where = buildProjectWhere(q, status, locationId, ownershipType);
  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        _count: { select: { properties: true, tranches: true, images: true } },
        location: true,
        client: { select: { id: true, firstName: true, lastName: true, reference: true, email: true, phone1: true } },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

function applyProjectOwnershipRules(data: Record<string, unknown>) {
  data.ownershipType = normalizeProjectOwnershipType(data.ownershipType);
  if (data.ownershipType === 'personnel') {
    data.clientId = null;
  } else if (data.clientId === '' || data.clientId == null) {
    data.clientId = null;
  }
}

router.post('/projects', async (req, res) => {
  const ownershipType = normalizeProjectOwnershipType(req.body.ownershipType);
  const clientId = ownershipType === 'client' ? (req.body.clientId || null) : null;
  const project = await prisma.project.create({
    data: {
      reference: await nextReference('PRJ'),
      name: req.body.name,
      ownershipType,
      clientId,
      city: req.body.city || null,
      address: req.body.address || null,
      description: req.body.description || null,
      remark: req.body.remark || null,
      status: req.body.status || 'actif',
      locationId: req.body.locationId || null,
    },
  });
  await audit(req, 'création', 'Project', project.id, project.name);
  res.status(201).json(project);
});

router.get('/projects/:id/history', async (req, res) => {
  const projectId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Project', entityId: projectId },
        { details: { contains: projectId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/projects/:id/sales', async (req, res) => {
  const projectId = String(req.params.id);
  const sales = await prisma.sale.findMany({
    where: { property: { projectId } },
    include: {
      client: { select: { id: true, reference: true, firstName: true, lastName: true } },
      property: { select: { id: true, reference: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(sales);
});

router.get('/projects/:id/rentals', async (req, res) => {
  const projectId = String(req.params.id);
  const rentals = await prisma.rental.findMany({
    where: { property: { projectId } },
    include: {
      client: { select: { id: true, reference: true, firstName: true, lastName: true } },
      property: { select: { id: true, reference: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(rentals);
});

router.get('/projects/:id/documents', async (req, res) => {
  const projectId = String(req.params.id);
  const docs = await prisma.document.findMany({
    where: {
      OR: [
        { entityType: 'Project', entityId: projectId },
        { property: { projectId } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

router.get('/projects/:id/tree', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      location: true,
      client: { select: { id: true, firstName: true, lastName: true, reference: true, email: true, phone1: true } },
      images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      chantiers: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true, status: true, progressPct: true, address: true, managerName: true },
      },
      properties: {
        orderBy: { name: 'asc' },
        select: { id: true, reference: true, name: true, status: true, price: true, floorId: true },
      },
      tranches: {
        orderBy: { name: 'asc' },
        include: {
          blocs: {
            orderBy: { name: 'asc' },
            include: {
              lots: {
                orderBy: { name: 'asc' },
                include: { floors: {
                  orderBy: { name: 'asc' },
                  include: {
                    _count: { select: { properties: true } },
                    properties: {
                      orderBy: { name: 'asc' },
                      select: { id: true, reference: true, name: true, status: true, price: true, floorId: true },
                    },
                  },
                } },
              },
            },
          },
        },
      },
    },
  });
  if (!project) return res.status(404).json({ message: 'Projet introuvable' });
  res.json(project);
});

router.get('/projects/:id', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      location: true,
      client: { select: { id: true, firstName: true, lastName: true, reference: true, email: true, phone1: true } },
      images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      _count: { select: { properties: true, tranches: true, images: true, chantiers: true } },
      properties: {
        select: { id: true, status: true, price: true },
      },
    },
  });
  if (!project) return res.status(404).json({ message: 'Projet introuvable' });

  const byStatus: Record<string, number> = {};
  let totalValue = 0;
  for (const p of project.properties) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    totalValue += Number(p.price || 0);
  }

  const { properties, ...rest } = project;
  res.json({
    ...rest,
    summary: {
      biens: properties.length,
      byStatus,
      totalValue,
      tranches: project._count.tranches,
    },
  });
});

router.put('/projects/:id', async (req, res) => {
  const ownershipType = req.body.ownershipType !== undefined
    ? normalizeProjectOwnershipType(req.body.ownershipType)
    : undefined;
  const clientId = ownershipType === 'personnel'
    ? null
    : req.body.clientId === '' ? null : req.body.clientId;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name,
      ownershipType,
      clientId,
      city: req.body.city,
      address: req.body.address || null,
      description: req.body.description,
      remark: req.body.remark || null,
      status: req.body.status,
      locationId: req.body.locationId === '' ? null : req.body.locationId,
    },
  });
  await audit(req, 'modification', 'Project', project.id, project.name);
  res.json(project);
});

router.delete('/projects/:id', async (req, res) => {
  const id = req.params.id;
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const count = await prisma.property.count({ where: { projectId: id } });
  if (count > 0) {
    return res.status(400).json({
      message: `Projet lié à ${count} bien(s) — suppression impossible (RG-PRJ-001)`,
    });
  }

  const tranches = await prisma.tranche.findMany({ where: { projectId: id }, select: { id: true } });
  for (const t of tranches) {
    const blocs = await prisma.bloc.findMany({ where: { trancheId: t.id }, select: { id: true } });
    for (const b of blocs) {
      const lots = await prisma.lot.findMany({ where: { blocId: b.id }, select: { id: true } });
      for (const l of lots) {
        await prisma.floor.deleteMany({ where: { lotId: l.id } });
      }
      await prisma.lot.deleteMany({ where: { blocId: b.id } });
    }
    await prisma.bloc.deleteMany({ where: { trancheId: t.id } });
  }
  await prisma.tranche.deleteMany({ where: { projectId: id } });
  await prisma.project.delete({ where: { id } });
  await audit(req, 'suppression', 'Project', id, motif);
  res.json({ ok: true });
});

router.post('/projects/:id/photo', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext)) {
    return res.status(400).json({ message: 'Format : JPG, PNG, WebP ou PDF' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const projectId = String(req.params.id);
  const count = await prisma.projectImage.count({ where: { projectId } });
  await prisma.projectImage.create({
    data: { projectId, path: photo, sortOrder: count },
  });
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { photo },
  });
  await audit(req, 'photo', 'Project', project.id, project.name);
  res.json(project);
});

router.get('/projects/:id/images', async (req, res) => {
  const projectId = String(req.params.id);
  const images = await prisma.projectImage.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json(images);
});

router.post('/projects/:id/images', upload.array('files', 30), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) return res.status(400).json({ message: 'Fichier(s) requis' });
  const projectId = String(req.params.id);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, photo: true } });
  if (!project) return res.status(404).json({ message: 'Projet introuvable' });

  const count = await prisma.projectImage.count({ where: { projectId } });
  const created: { id: string; path: string }[] = [];
  let order = count;

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXT.includes(ext)) continue;
    const imagePath = `/uploads/${file.filename}`;
    const img = await prisma.projectImage.create({
      data: { projectId, path: imagePath, sortOrder: order },
    });
    created.push({ id: img.id, path: img.path });
    order++;
  }

  if (!created.length) {
    return res.status(400).json({ message: 'Format image : JPG, PNG ou WebP' });
  }

  if (!project.photo) {
    await prisma.project.update({ where: { id: projectId }, data: { photo: created[0].path } });
  }

  await audit(req, 'images', 'Project', projectId, `${created.length} image(s)`);
  res.status(201).json({ created });
});

router.post('/projects/:id/images/:imageId/cover', async (req, res) => {
  const projectId = String(req.params.id);
  const imageId = String(req.params.imageId);
  const img = await prisma.projectImage.findFirst({ where: { id: imageId, projectId } });
  if (!img) return res.status(404).json({ message: 'Image introuvable' });
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { photo: img.path },
  });
  res.json(project);
});

router.delete('/projects/:id/images/:imageId', async (req, res) => {
  const projectId = String(req.params.id);
  const imageId = String(req.params.imageId);
  const img = await prisma.projectImage.findFirst({ where: { id: imageId, projectId } });
  if (!img) return res.status(404).json({ message: 'Image introuvable' });

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { photo: true } });
  await prisma.projectImage.delete({ where: { id: imageId } });

  if (project?.photo === img.path) {
    const next = await prisma.projectImage.findFirst({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { photo: next?.path ?? null },
    });
  }

  await audit(req, 'suppression_image', 'Project', projectId, imageId);
  res.json({ ok: true });
});

router.post('/projects/:id/tranches', async (req, res) => {
  const tranche = await prisma.tranche.create({
    data: { name: req.body.name, projectId: req.params.id },
  });
  await audit(req, 'création', 'Tranche', tranche.id, tranche.name);
  res.status(201).json(tranche);
});

router.put('/tranches/:id', async (req, res) => {
  const tranche = await prisma.tranche.update({
    where: { id: req.params.id },
    data: { name: req.body.name },
  });
  res.json(tranche);
});

router.delete('/tranches/:id', async (req, res) => {
  const id = req.params.id;
  const linked = await prisma.property.count({
    where: { floor: { lot: { bloc: { trancheId: id } } } },
  });
  if (linked > 0) {
    return res.status(400).json({ message: 'Tranche liée à des biens — suppression impossible' });
  }
  const blocs = await prisma.bloc.findMany({ where: { trancheId: id }, select: { id: true } });
  for (const b of blocs) {
    const lots = await prisma.lot.findMany({ where: { blocId: b.id }, select: { id: true } });
    for (const l of lots) {
      await prisma.floor.deleteMany({ where: { lotId: l.id } });
    }
    await prisma.lot.deleteMany({ where: { blocId: b.id } });
  }
  await prisma.bloc.deleteMany({ where: { trancheId: id } });
  await prisma.tranche.delete({ where: { id } });
  res.json({ ok: true });
});

router.post('/tranches/:id/blocs', async (req, res) => {
  const bloc = await prisma.bloc.create({
    data: { name: req.body.name, trancheId: req.params.id },
  });
  res.status(201).json(bloc);
});

router.put('/blocs/:id', async (req, res) => {
  const bloc = await prisma.bloc.update({
    where: { id: req.params.id },
    data: { name: req.body.name },
  });
  res.json(bloc);
});

router.delete('/blocs/:id', async (req, res) => {
  const id = req.params.id;
  const linked = await prisma.property.count({
    where: { floor: { lot: { blocId: id } } },
  });
  if (linked > 0) {
    return res.status(400).json({ message: 'Bloc lié à des biens — suppression impossible' });
  }
  const lots = await prisma.lot.findMany({ where: { blocId: id }, select: { id: true } });
  for (const l of lots) {
    await prisma.floor.deleteMany({ where: { lotId: l.id } });
  }
  await prisma.lot.deleteMany({ where: { blocId: id } });
  await prisma.bloc.delete({ where: { id } });
  res.json({ ok: true });
});

router.post('/blocs/:id/lots', async (req, res) => {
  const lot = await prisma.lot.create({
    data: { name: req.body.name, blocId: req.params.id },
  });
  res.status(201).json(lot);
});

router.put('/lots/:id', async (req, res) => {
  const lot = await prisma.lot.update({
    where: { id: req.params.id },
    data: { name: req.body.name },
  });
  res.json(lot);
});

router.delete('/lots/:id', async (req, res) => {
  const id = req.params.id;
  const linked = await prisma.property.count({ where: { floor: { lotId: id } } });
  if (linked > 0) {
    return res.status(400).json({ message: 'Lot lié à des biens — suppression impossible' });
  }
  await prisma.floor.deleteMany({ where: { lotId: id } });
  await prisma.lot.delete({ where: { id } });
  res.json({ ok: true });
});

router.post('/lots/:id/floors', async (req, res) => {
  const floor = await prisma.floor.create({
    data: { name: req.body.name, lotId: req.params.id },
  });
  res.status(201).json(floor);
});

router.put('/floors/:id', async (req, res) => {
  const floor = await prisma.floor.update({
    where: { id: req.params.id },
    data: { name: req.body.name },
  });
  res.json(floor);
});

router.delete('/floors/:id', async (req, res) => {
  const id = req.params.id;
  const linked = await prisma.property.count({ where: { floorId: id } });
  if (linked > 0) {
    return res.status(400).json({ message: 'Étage lié à des biens — suppression impossible' });
  }
  await prisma.floor.delete({ where: { id } });
  res.json({ ok: true });
});

// --- Biens ---
router.get('/properties/export/csv', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const projectId = String(req.query.projectId || '');
  const where = buildPropertyWhere(q, status, projectId);
  const properties = await prisma.property.findMany({
    where,
    include: { project: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const header = 'Référence;Nom;Projet;Ville;Statut;Surface;Pièces;Prix;Titre foncier';
  const rows = properties.map(
    (p) =>
      `${p.reference};${p.name};${p.project?.name || ''};${p.city || ''};${p.status};${p.surface ?? ''};${p.rooms ?? ''};${p.price ?? ''};${p.titleNumber || ''}`
  );
  const csv = [header, ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=biens-gic.csv');
  res.send('\uFEFF' + csv);
});

router.get('/properties/export/xlsx', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const projectId = String(req.query.projectId || '');
  const where = buildPropertyWhere(q, status, projectId);
  const properties = await prisma.property.findMany({
    where,
    include: { project: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  sendExcel(
    res,
    'biens-gic.xlsx',
    'Biens',
    properties.map((p) => ({
      Référence: p.reference,
      Nom: p.name,
      Projet: p.project?.name || '',
      Ville: p.city || '',
      Statut: p.status,
      Surface: p.surface ?? '',
      Pièces: p.rooms ?? '',
      Prix: p.price ?? '',
      'Titre foncier': p.titleNumber || '',
    })),
  );
});

router.get('/properties/stats', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const projectId = String(req.query.projectId || '');
  const where = buildPropertyWhere(q, status, projectId);

  const [total, disponibles, reserves, vendus, loues, indisponibles, valeur] = await Promise.all([
    prisma.property.count({ where }),
    prisma.property.count({ where: { ...where, status: 'disponible' } }),
    prisma.property.count({ where: { ...where, status: 'réservé' } }),
    prisma.property.count({ where: { ...where, status: 'vendu' } }),
    prisma.property.count({ where: { ...where, status: 'loué' } }),
    prisma.property.count({ where: { ...where, status: 'indisponible' } }),
    prisma.property.aggregate({
      _sum: { price: true },
      where: { AND: [where, { status: { in: ['disponible', 'réservé'] } }] },
    }),
  ]);
  res.json({
    total,
    disponibles,
    reserves,
    vendus,
    loues,
    indisponibles,
    valeurPatrimoine: valeur._sum.price || 0,
  });
});

router.get('/properties', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '');
  const projectId = String(req.query.projectId || '');
  const sort = String(req.query.sort || 'createdAt');
  const order = req.query.order === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const orderBy =
    sort === 'name'
      ? { name: order as 'asc' | 'desc' }
      : sort === 'reference'
        ? { reference: order as 'asc' | 'desc' }
        : sort === 'price'
          ? { price: order as 'asc' | 'desc' }
          : { createdAt: order as 'asc' | 'desc' };

  const where = buildPropertyWhere(q, status, projectId);
  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        project: true,
        floor: { include: { lot: { include: { bloc: { include: { tranche: true } } } } } },
        sales: {
          where: { status: { not: 'résiliée' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            client: { select: { id: true, firstName: true, lastName: true, reference: true, phone1: true } },
          },
        },
        rentals: {
          where: { status: { not: 'résiliée' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            client: { select: { id: true, firstName: true, lastName: true, reference: true, phone1: true } },
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    }),
    prisma.property.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.get('/properties/:id/history', async (req, res) => {
  const propertyId = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Property', entityId: propertyId },
        { details: { contains: propertyId } },
      ],
    },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.get('/properties/:id', async (req, res) => {
  const property = await prisma.property.findUnique({
    where: { id: req.params.id },
    include: {
      project: true,
      floor: { include: { lot: { include: { bloc: { include: { tranche: true } } } } } },
      sales: { include: { client: true, payments: true } },
      rentals: { include: { client: true, payments: true } },
      documents: true,
    },
  });
  if (!property) return res.status(404).json({ message: 'Bien introuvable' });
  res.json(property);
});

router.post('/properties', async (req, res) => {
  const reference = await nextReference('BIEN');
  const property = await prisma.property.create({
    data: {
      ...req.body,
      reference,
      price: req.body.price ? Number(req.body.price) : null,
      surface: req.body.surface ? Number(req.body.surface) : null,
      rooms: req.body.rooms ? Number(req.body.rooms) : null,
      projectId: req.body.projectId || null,
      floorId: req.body.floorId || null,
    },
  });
  await audit(req, 'création', 'Property', property.id, reference);
  res.status(201).json(property);
});

router.put('/properties/:id', async (req, res) => {
  const data = { ...req.body };
  delete data.reference;
  delete data.id;
  if (data.price != null) data.price = Number(data.price);
  if (data.surface != null) data.surface = Number(data.surface);
  if (data.rooms != null) data.rooms = Number(data.rooms);
  if (data.projectId === '') data.projectId = null;
  if (data.floorId === '') data.floorId = null;
  const property = await prisma.property.update({ where: { id: req.params.id }, data });
  await audit(req, 'modification', 'Property', property.id, property.reference);
  res.json(property);
});

router.post('/properties/:id/photo', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Photo requise' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return res.status(400).json({ message: 'Format photo : JPG, PNG ou WebP' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const propertyId = String(req.params.id);
  const property = await prisma.property.update({
    where: { id: propertyId },
    data: { photo },
  });
  await audit(req, 'photo', 'Property', property.id, property.reference);
  res.json(property);
});

router.delete('/properties/:id', async (req, res) => {
  const id = String(req.params.id);
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ message: 'Motif de suppression obligatoire' });

  const [activeSales, activeRentals] = await Promise.all([
    prisma.sale.count({ where: { propertyId: id, status: { notIn: ['annulée', 'résiliée'] } } }),
    prisma.rental.count({ where: { propertyId: id, status: 'active' } }),
  ]);
  if (activeSales > 0 || activeRentals > 0) {
    return res.status(400).json({
      message: `Bien lié à des transactions actives — suppression impossible (RG-BIEN-003)`,
    });
  }

  await prisma.property.delete({ where: { id } });
  await audit(req, 'suppression', 'Property', id, motif);
  res.json({ ok: true });
});

export default router;
