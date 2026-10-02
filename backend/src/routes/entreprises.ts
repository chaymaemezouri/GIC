import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { audit } from '../lib/audit.js';
import {
  backfillEntreprisesFromSubcontracts,
  createEntreprise,
  deleteEntreprise,
  getEntreprise,
  listEntreprises,
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
  if (!companyName) return res.status(400).json({ message: 'Entreprise requise' });
  const created = await createEntreprise({
    companyName,
    phone: req.body.phone ? String(req.body.phone).trim() : null,
    email: req.body.email ? String(req.body.email).trim() : null,
    address: req.body.address ? String(req.body.address).trim() : null,
    ice: req.body.ice ? String(req.body.ice).trim() : null,
    remark: req.body.remark ? String(req.body.remark).trim() : null,
  });
  await audit(req, 'création', 'Entreprise', created.id, created.companyName);
  res.status(201).json(created);
});

router.get('/:id', async (req, res) => {
  const item = await getEntreprise(String(req.params.id));
  if (!item) return res.status(404).json({ message: 'Entreprise introuvable' });
  res.json(item);
});

router.put('/:id', async (req, res) => {
  const item = await updateEntreprise(String(req.params.id), {
    companyName: req.body.companyName != null ? String(req.body.companyName).trim() : undefined,
    phone: req.body.phone !== undefined ? (req.body.phone ? String(req.body.phone).trim() : null) : undefined,
    email: req.body.email !== undefined ? (req.body.email ? String(req.body.email).trim() : null) : undefined,
    address: req.body.address !== undefined ? (req.body.address ? String(req.body.address).trim() : null) : undefined,
    ice: req.body.ice !== undefined ? (req.body.ice ? String(req.body.ice).trim() : null) : undefined,
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
