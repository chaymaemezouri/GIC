import { prisma } from './prisma.js';

export async function getAgentLabel(agentId: string | null | undefined) {
  if (!agentId) return null;
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  return agent ? `${agent.firstName} ${agent.lastName}` : null;
}

export async function recordClientAgentChange(
  clientId: string,
  previousAgentId: string | null | undefined,
  newAgentId: string | null | undefined,
  changedBy?: string
) {
  const prev = previousAgentId || null;
  const next = newAgentId || null;
  if (prev === next) return;

  const [previousAgentName, newAgentName] = await Promise.all([
    getAgentLabel(prev),
    getAgentLabel(next),
  ]);

  await prisma.clientAgentHistory.create({
    data: {
      clientId,
      previousAgentId: prev,
      previousAgentName,
      newAgentId: next,
      newAgentName,
      changedBy: changedBy || null,
    },
  });
}
