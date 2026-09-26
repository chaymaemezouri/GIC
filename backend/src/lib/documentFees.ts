import { prisma } from './prisma.js';
import { notifyAllAdmins } from './notifications.js';

/** Somme des frais de dossiers liés à un chantier (optionnels). */
export async function sumChantierDocumentFees(chantierId: string): Promise<number> {
  const agg = await prisma.document.aggregate({
    where: { chantierId, feeAmount: { gt: 0 } },
    _sum: { feeAmount: true },
  });
  return Number(agg._sum.feeAmount || 0);
}

/**
 * Notifie les dossiers en retard (date estimée de fin dépassée, non validés).
 * Anti-spam : une notif max toutes les 24 h par document.
 */
export async function syncLateDocumentNotifications(): Promise<number> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const late = await prisma.document.findMany({
    where: {
      estimatedEndDate: { lt: startOfToday },
      NOT: { status: 'valid' },
      OR: [{ lateNotifiedAt: null }, { lateNotifiedAt: { lt: dayAgo } }],
    },
    take: 40,
    include: {
      chantier: { select: { id: true, name: true } },
    },
  });

  for (const doc of late) {
    const chantierLabel = doc.chantier?.name ? ` — chantier ${doc.chantier.name}` : '';
    const end = doc.estimatedEndDate
      ? doc.estimatedEndDate.toISOString().slice(0, 10)
      : '';
    await notifyAllAdmins(
      'Dossier en retard',
      `« ${doc.name} »${chantierLabel} : date estimée dépassée (${end}).`,
      {
        link: `/documents/${doc.id}`,
        type: 'doc_retard',
        email: false,
      },
    );
    await prisma.document.update({
      where: { id: doc.id },
      data: { lateNotifiedAt: new Date() },
    });
  }

  return late.length;
}

export function parseOptionalFee(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseOptionalDate(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}
