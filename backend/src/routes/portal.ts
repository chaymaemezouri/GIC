import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import jwt from 'jsonwebtoken';

import { upload } from '../lib/upload.js';

import { notifyAllAdmins } from '../lib/notifications.js';

import { sendEmail } from '../lib/email.js';



const router = Router();



declare global {

  namespace Express {

    interface Request {

      supplier?: { id: string; email: string; role: string };

    }

  }

}



const SUPPLIER_DOC_CATEGORIES = ['devis', 'facture', 'bon_livraison', 'bon_commande', 'recu', 'bon_caisse'] as const;



function requireSupplier(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {

  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {

    return res.status(401).json({ message: 'Authentification requise' });

  }

  try {

    const token = header.slice(7);

    const secret = process.env.JWT_SECRET || 'dev';

    const payload = jwt.verify(token, secret) as { supplierId?: string; role?: string; email?: string };

    if (payload.role !== 'SUPPLIER' || !payload.supplierId) {

      return res.status(403).json({ message: 'Accès réservé aux fournisseurs' });

    }

    req.supplier = { id: payload.supplierId, email: payload.email || '', role: payload.role };

    next();

  } catch {

    return res.status(401).json({ message: 'Session expirée' });

  }

}



router.use(requireSupplier);



router.get('/profile', async (req, res) => {

  const supplier = await prisma.supplier.findUnique({ where: { id: req.supplier!.id } });

  if (!supplier) return res.status(404).json({ message: 'Fournisseur introuvable' });

  res.json({

    id: supplier.id,

    reference: supplier.reference,

    companyName: supplier.companyName,

    email: supplier.email,

    phone1: supplier.phone1,

  });

});



router.get('/purchases', async (req, res) => {

  const purchases = await prisma.purchase.findMany({

    where: { supplierId: req.supplier!.id },

    include: { chantier: true },

    orderBy: { date: 'desc' },

  });

  const docCounts = await prisma.document.groupBy({

    by: ['entityId'],

    where: { entityType: 'purchase', supplierId: req.supplier!.id },

    _count: { id: true },

  });

  const countMap = Object.fromEntries(docCounts.map((d) => [d.entityId, d._count.id]));

  const enriched = purchases.map((p) => ({ ...p, docCount: countMap[p.id] || 0 }));

  const total = purchases.reduce((s, p) => s + p.totalPrice, 0);

  res.json({ purchases: enriched, total });

});



router.get('/purchases/:id/documents', async (req, res) => {
  const purchaseId = String(req.params.id);
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, supplierId: req.supplier!.id },
  });

  if (!purchase) return res.status(404).json({ message: 'Achat introuvable' });

  const docs = await prisma.document.findMany({

    where: { entityType: 'purchase', entityId: purchase.id },

    orderBy: { createdAt: 'desc' },

  });

  res.json(docs);

});



router.post('/purchases/:id/documents', upload.single('file'), async (req, res) => {

  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });

  const category = String(req.body.category || 'devis');

  if (!SUPPLIER_DOC_CATEGORIES.includes(category as (typeof SUPPLIER_DOC_CATEGORIES)[number])) {

    return res.status(400).json({ message: 'Catégorie : devis, facture ou bon_livraison' });

  }

  const purchaseId = String(req.params.id);
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, supplierId: req.supplier!.id },
    include: { supplier: true },
  });

  if (!purchase) return res.status(404).json({ message: 'Achat introuvable' });



  const doc = await prisma.document.create({

    data: {

      name: req.body.name || req.file.originalname,

      category,

      mimeType: req.file.mimetype,

      size: req.file.size,

      path: `/uploads/${req.file.filename}`,

      entityType: 'purchase',

      entityId: purchase.id,

      supplierId: req.supplier!.id,

    },

  });



  const label = { devis: 'Devis', facture: 'Facture', bon_livraison: 'Bon de livraison' }[category] || category;

  await notifyAllAdmins(

    `${label} fournisseur`,

    `${purchase.supplier?.companyName || 'Fournisseur'} a déposé un ${label.toLowerCase()} pour l'achat ${purchase.reference}`,

    { link: '/achats', type: 'info' }

  );

  await sendEmail(

    process.env.ADMIN_EMAIL || 'admin@gic.ma',

    `GIC — ${label} reçu (${purchase.reference})`,

    `${purchase.supplier?.companyName} a déposé un document (${label}) pour l'achat ${purchase.reference}.`

  ).catch(() => {});



  res.status(201).json(doc);

});



export default router;

