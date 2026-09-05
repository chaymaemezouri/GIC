const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const rows = [
  ['payment_nature', 'Avance', 'Avance', 1],
  ['payment_nature', 'Échéance', 'Échéance', 2],
  ['payment_nature', 'Loyer', 'Loyer', 3],
  ['payment_nature', 'Solde', 'Solde', 4],
  ['payment_nature', 'Acompte', 'Acompte', 5],
  ['payment_nature', 'Mensualité', 'Mensualité', 6],
  ['purchase_unit', 'Unité', 'Unité', 1],
  ['purchase_unit', 'm²', 'm²', 2],
  ['purchase_unit', 'm³', 'm³', 3],
  ['purchase_unit', 'tonne', 'tonne', 4],
  ['purchase_unit', 'kg', 'kg', 5],
  ['purchase_unit', 'litre', 'litre', 6],
  ['purchase_unit', 'pièce', 'pièce', 7],
  ['purchase_unit', 'lot', 'lot', 8],
  ['purchase_unit', 'forfait', 'forfait', 9],
];
(async () => {
  for (const [category, label, value, sortOrder] of rows) {
    const existing = await p.dropdownOption.findFirst({ where: { category, value } });
    if (!existing) {
      await p.dropdownOption.create({ data: { category, label, value, sortOrder, isActive: true } });
    }
  }
  console.log('dropdowns ok');
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
