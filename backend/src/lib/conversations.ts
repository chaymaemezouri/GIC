import { prisma } from './prisma.js';

export type EntityType = 'Client' | 'Agent' | 'Supplier' | 'User' | 'Mandant' | 'Project' | 'Workforce';

export async function logConversation(opts: {
  entityType: EntityType;
  entityId: string;
  channel: 'email' | 'sms' | 'whatsapp';
  direction?: 'outbound' | 'inbound';
  subject?: string;
  body: string;
  recipient?: string;
  status?: string;
  userId?: string;
  userName?: string;
}) {
  return prisma.conversationMessage.create({
    data: {
      entityType: opts.entityType,
      entityId: opts.entityId,
      channel: opts.channel,
      direction: opts.direction || 'outbound',
      subject: opts.subject || null,
      body: opts.body,
      recipient: opts.recipient || null,
      status: opts.status || 'sent',
      userId: opts.userId || null,
      userName: opts.userName || null,
    },
  });
}

export async function getConversationHistory(entityType: EntityType, entityId: string, limit = 50) {
  return prisma.conversationMessage.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
