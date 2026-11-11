import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import { parseRib } from '../lib/rib.js';
import {
  backfillEntreprisesFromSubcontracts,
  createEntreprise,
  deleteEntreprise,
  getEntreprise,
  listEntreprises,
  listSubcontractsForCompany,
  updateEntreprise,
} from '../lib/entreprises.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

backfillEntreprisesFromSubcontracts().catch(() => {});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const active = String(req.query.active || '');
  const items = await listEntreprises(q, active);
  res.json({ items, total: items.length, page: 1, pages: 1 });
});

router.post('/', async (req, res) => {
  const companyName = String(req.body.companyName || '').trim();
  const phone = String(req.body.phone || '').trim();
  if (!companyName) return res.status(400).json({ message: 'Entreprise requise' });
  if (!phone) return res.status(400).json({ message: 'Le téléphone est obligatoire' });
  const rib = parseRib(req.body.rib);
  if (rib.error) return res.status(400).json({ message: rib.error });
  const created = await createEntreprise({
    companyName,
    phone,
    email: req.body.email ? String(req.body.email).trim() : null,
    address: req.body.address ? String(req.body.address).trim() : null,
    ice: req.body.ice ? String(req.body.ice).trim() : null,
    bankName: req.body.bankName ? String(req.body.bankName).trim() : null,
    rib: rib.rib,
    remark: req.body.remark ? String(req.body.remark).trim() : null,
  });
  await audit(req, 'création', 'Entreprise', created.id, created.companyName);
  res.status(201).json(created);
});

router.get('/:id', async (req, res) => {
  try {
    const item = await getEntreprise(String(req.params.id));
    if (!item) return res.status(404).json({ message: 'Entreprise introuvable' });
    let subcontractors: Awaited<ReturnType<typeof listSubcontractsForCompany>> = [];
    try {
      subcontractors = await listSubcontractsForCompany(item.companyName);
    } catch (err) {
      console.error('[entreprises] sous-traitances', err);
    }
    const amount = subcontractors.reduce((s, row) => s + Number(row.amount || 0), 0);
    const paid = subcontractors.reduce((s, row) => s + Number(row.paidAmount || 0), 0);
    res.json({
      ...item,
      subcontractors,
      totals: {
        count: subcontractors.length,
        amount,
        paid,
        remaining: Math.max(0, amount - paid),
        sites: new Set(subcontractors.map((row) => row.chantierId)).size,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur';
    res.status(500).json({ message });
  }
});

router.put('/:id', async (req, res) => {
  if (req.body.companyName !== undefined && !String(req.body.companyName || '').trim()) {
    return res.status(400).json({ message: 'Entreprise requise' });
  }
  if (req.body.phone !== undefined && !String(req.body.phone || '').trim()) {
    return res.status(400).json({ message: 'Le téléphone est obligatoire' });
  }
  const rib = req.body.rib !== undefined ? parseRib(req.body.rib) : null;
  if (rib?.error) return res.status(400).json({ message: rib.error });
  const item = await updateEntreprise(String(req.params.id), {
    companyName: req.body.companyName != null ? String(req.body.companyName).trim() : undefined,
    phone: req.body.phone !== undefined ? String(req.body.phone).trim() : undefined,
    email: req.body.email !== undefined ? (req.body.email ? String(req.body.email).trim() : null) : undefined,
    address: req.body.address !== undefined ? (req.body.address ? String(req.body.address).trim() : null) : undefined,
    ice: req.body.ice !== undefined ? (req.body.ice ? String(req.body.ice).trim() : null) : undefined,
    bankName: req.body.bankName !== undefined ? (req.body.bankName ? String(req.body.bankName).trim() : null) : undefined,
    rib: rib ? rib.rib : undefined,
    remark: req.body.remark !== undefined ? (req.body.remark ? String(req.body.remark).trim() : null) : undefined,
    isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
  });
  if (!item) return res.status(404).json({ message: 'Entreprise introuvable' });
  await audit(req, 'modification', 'Entreprise', item.id, item.companyName);
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  const item = await getEntreprise(String(req.params.id));
  if (!item) return res.status(404).json({ message: 'Entreprise introuvable' });
  await deleteEntreprise(item.id);
  await audit(req, 'suppression', 'Entreprise', item.id, item.companyName);
  res.json({ ok: true });
});

export default router;
