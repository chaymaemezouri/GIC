import { prisma } from './prisma.js';

export async function nextReference(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const counter = await prisma.counter.upsert({
    where: { prefix_year: { prefix, year } },
    create: { id: `${prefix}-${year}`, prefix, year, value: 1 },
    update: { value: { increment: 1 } },
  });
  const padded = String(counter.value).padStart(6, '0');
  return `${prefix}-${year}-${padded}`;
}
