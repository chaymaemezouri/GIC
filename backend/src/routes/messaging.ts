import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { sendEmail } from '../lib/email.js';
import { sendSms, sendWhatsApp } from '../lib/messaging.js';
import { logConversation, getConversationHistory } from '../lib/conversations.js';
import { audit } from '../lib/audit.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission);

type EntityKind = 'Client' | 'Agent' | 'Supplier' | 'User' | 'Mandant' | 'Project' | 'Workforce';

async function resolveContact(entityType: EntityKind, entityId: string) {
  if (entityType === 'Client') {
    const c = await prisma.client.findUnique({ where: { id: entityId } });
    if (!c) return null;
    return { email: c.email, phone: c.phone1, label: `${c.firstName} ${c.lastName}` };
  }
  if (entityType === 'Agent') {
    const a = await prisma.agent.findUnique({ where: { id: entityId } });
    if (!a) return null;
    return { email: a.email, phone: a.phone1, label: `${a.firstName} ${a.lastName}` };
  }
  if (entityType === 'Supplier') {
    const s = await prisma.supplier.findUnique({ where: { id: entityId } });
    if (!s) return null;
    return { email: s.email, phone: s.phone1, label: s.companyName };
  }
  if (entityType === 'Mandant') {
    const m = await prisma.mandant.findUnique({ where: { id: entityId } });
    if (!m) return null;
    return { email: m.email, phone: m.phone1, label: `${m.firstName} ${m.lastName}` };
  }
  if (entityType === 'Project') {
    const p = await prisma.project.findUnique({
      where: { id: entityId },
      include: { client: { select: { email: true, phone1: true, firstName: true, lastName: true } } },
    });
    if (!p) return null;
    const label = p.reference ? `${p.reference} — ${p.name}` : p.name;
    if (p.client) {
      return {
        email: p.client.email,
        phone: p.client.phone1,
        label: `${label} (client : ${p.client.firstName} ${p.client.lastName})`,
      };
    }
    return { email: null, phone: null, label };
  }
  if (entityType === 'Workforce') {
    const w = await prisma.workforce.findUnique({ where: { id: entityId } });
    if (!w) return null;
    return {
      email: w.email,
      phone: w.phone1,
      label: `${w.reference || ''} — ${w.firstName} ${w.lastName}`.trim(),
    };
  }
  if (entityType === 'User') {
    const u = await prisma.user.findUnique({ where: { id: entityId } });
    if (!u) return null;
    return { email: u.email, phone: null, label: `${u.firstName} ${u.lastName}` };
  }
  return null;
}

router.get('/:entityType/:entityId', async (req, res) => {
  const entityType = String(req.params.entityType) as EntityKind;
  const entityId = String(req.params.entityId);
  const items = await getConversationHistory(entityType, entityId, 100);
  res.json({ items });
});

router.post('/:entityType/:entityId/send', async (req, res) => {
  const entityType = String(req.params.entityType) as EntityKind;
  const entityId = String(req.params.entityId);
  const { channel, subject, message, recipient } = req.body || {};
  if (!channel || !message) {
    return res.status(400).json({ message: 'Canal et message requis' });
  }

  if (channel === 'note') {
    await logConversation({
      entityType,
      entityId,
      channel: 'note',
      body: String(message),
      subject: subject || 'Note interne',
      userId: req.user?.id,
      userName: req.user?.email,
    });
    await audit(req, 'note', entityType, entityId, String(message).slice(0, 120));
    return res.json({ ok: true, logged: true });
  }

  const contact = await resolveContact(entityType, entityId);
  if (!contact) return res.status(404).json({ message: 'Destinataire introuvable' });

  const toEmail = recipient?.email || contact.email;
  const toPhone = recipient?.phone || contact.phone;
  let result: Record<string, unknown> = {};

  if (channel === 'email') {
    if (!toEmail) return res.status(400).json({ message: 'Email manquant' });
    result = await sendEmail(toEmail, subject || 'GIC — Expertise & Consulting', String(message));
    await logConversation({
      entityType,
      entityId,
      channel: 'email',
      subject: subject || 'GIC',
      body: String(message),
      recipient: toEmail,
      userId: req.user?.id,
      userName: req.user?.email,
    });
  } else if (channel === 'sms') {
    if (!toPhone) return res.status(400).json({ message: 'Téléphone manquant' });
    result = await sendSms(toPhone, String(message));
    await logConversation({
      entityType,
      entityId,
      channel: 'sms',
      body: String(message),
      recipient: toPhone,
      userId: req.user?.id,
      userName: req.user?.email,
    });
  } else if (channel === 'whatsapp') {
    if (!toPhone) return res.status(400).json({ message: 'Téléphone manquant' });
    result = await sendWhatsApp(toPhone, String(message));
    await logConversation({
      entityType,
      entityId,
      channel: 'whatsapp',
      body: String(message),
      recipient: toPhone,
      userId: req.user?.id,
      userName: req.user?.email,
    });
  } else {
    return res.status(400).json({ message: 'Canal : email, sms ou whatsapp' });
  }

  await audit(req, `notification_${channel}`, entityType, entityId, String(message).slice(0, 120));
  res.json({ ok: true, ...result });
});

export default router;
