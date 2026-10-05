import fs from 'fs';
import path from 'path';
import type { Engin, Prisma, PrismaClient } from '@prisma/client';
import { normalizeLines, summarizeLines, recomputePurchase, syncPaymentMovement, round2 } from '../src/lib/purchaseWorkflow.js';
import { removeAutomaticMovement, syncEnginExpenseMovement } from '../src/lib/cashSync.js';
import { inclusiveDays, plannedCostOf, refreshEnginStatus, suggestAssignmentCost } from '../src/lib/enginCosts.js';

export type SeedChantier = {
  id: string;
  name: string;
  city: string;
  manager: string;
  projectId: string | null;
  tranches: string[];
};

export type SeedContext = {
  prisma: PrismaClient;
  uploadDir: string;
  chantiers: SeedChantier[];
  supplierIds: string[];
  /** Chauffeurs dans l'ordre du seed (le dernier est inactif : jamais attitré) */
  chauffeurs: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string; city: string }>;
  clientIds: string[];
  adminId: string;
};

const DAY = 86_400_000;
const pad = (n: number, len = 6) => String(n).padStart(len, '0');
const ADMIN_NAME = 'Super Administrateur';

/** Minuit UTC il y a `n` jours (négatif = dans le futur) — même convention que les dates saisies dans l'app. */
export function utcDaysAgo(n: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n));
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const minDate = (a: Date, b: Date) => (a < b ? a : b);
const maxDate = (a: Date, b: Date) => (a > b ? a : b);
const today = () => utcDaysAgo(0);

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Fichiers de démonstration (PDF / SVG) ──────────────────────────

function writeDemoPdf(uploadDir: string, fileName: string, title: string, lines: string[]) {
  const filePath = path.join(uploadDir, fileName);
  if (fs.existsSync(filePath)) return `/uploads/${fileName}`;
  const ascii = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ');
  const esc = (s: string) => ascii(s).replace(/[\\()]/g, (c) => `\\${c}`);
  const content = [
    'BT',
    '/F1 20 Tf',
    '60 770 Td',
    `(${esc(title)}) Tj`,
    '/F1 11 Tf',
    '0 -14 Td',
    '(GIC - Gestion Immobiliere & Chantier) Tj',
    ...lines.flatMap((l) => ['0 -22 Td', `(${esc(l)}) Tj`]),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(filePath, pdf, 'latin1');
  return `/uploads/${fileName}`;
}

function writeSceneSvg(uploadDir: string, fileName: string, title: string, subtitle: string, hue: number, variant: number) {
  const buildings = Array.from({ length: 7 }, (_, k) => {
    const w = 70 + ((k * 37 + variant * 13) % 45);
    const h = 90 + ((k * 53 + variant * 29) % 160);
    const x = 10 + k * 112;
    const y = 330 - h;
    const windows: string[] = [];
    for (let wy = y + 14; wy < 318; wy += 26) {
      for (let wx = x + 10; wx < x + w - 14; wx += 20) {
        windows.push(`<rect x="${wx}" y="${wy}" width="10" height="14" fill="hsl(${hue},35%,${(wx + wy + variant) % 3 === 0 ? 82 : 58}%)"/>`);
      }
    }
    const scaffold = k % 3 === variant % 3 ? `<rect x="${x - 4}" y="${y - 6}" width="${w + 8}" height="${h + 6}" fill="none" stroke="#c28a2c" stroke-width="3" stroke-dasharray="8 6"/>` : '';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="hsl(${hue},14%,${34 + (k % 3) * 9}%)"/>${windows.join('')}${scaffold}`;
  }).join('');
  const craneX = 520 + (variant % 3) * 60;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue},70%,72%)"/>
      <stop offset="1" stop-color="hsl(${hue + 25},65%,92%)"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#sky)"/>
  <circle cx="${120 + variant * 90}" cy="80" r="34" fill="#fff6d5" opacity="0.9"/>
  ${buildings}
  <g stroke="#e0a31f" stroke-width="6" fill="none">
    <line x1="${craneX}" y1="330" x2="${craneX}" y2="60"/>
    <line x1="${craneX - 70}" y1="66" x2="${craneX + 210}" y2="66"/>
    <line x1="${craneX + 160}" y1="66" x2="${craneX + 160}" y2="150" stroke-width="2"/>
  </g>
  <rect x="${craneX + 148}" y="150" width="24" height="18" fill="#6b7280"/>
  <rect y="330" width="800" height="120" fill="hsl(32,28%,60%)"/>
  <rect y="372" width="800" height="78" fill="rgba(0,0,0,0.48)"/>
  <text x="28" y="408" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="700" fill="#ffffff">${xmlEscape(title)}</text>
  <text x="28" y="434" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#e5e7eb">${xmlEscape(subtitle)}</text>
</svg>`;
  fs.writeFileSync(path.join(uploadDir, fileName), svg, 'utf8');
  return `/uploads/${fileName}`;
}

// ─── Achats : cycle complet (lignes, livraisons, paiements, factures) ─

type CatalogItem = { product: string; ref: string; unit: string; price: number };

export const PURCHASE_CATALOG: Record<string, CatalogItem[]> = {
  'Gros œuvre': [
    { product: 'Béton prêt à l’emploi C25/30', ref: 'BET-C25', unit: 'm³', price: 950 },
    { product: 'Acier HA Fe E500 Ø12', ref: 'ACI-HA12', unit: 'tonne', price: 9800 },
    { product: 'Ciment CPJ 45 (sac 50 kg)', ref: 'CIM-CPJ45', unit: 'pièce', price: 78 },
    { product: 'Gravier concassé 15/25', ref: 'GRA-1525', unit: 'm³', price: 185 },
    { product: 'Sable de concassage 0/4', ref: 'SAB-04', unit: 'm³', price: 160 },
    { product: 'Parpaing creux 20×20×50', ref: 'PAR-20', unit: 'pièce', price: 6.5 },
    { product: 'Treillis soudé ST25', ref: 'TRE-ST25', unit: 'pièce', price: 245 },
  ],
  'Second œuvre': [
    { product: 'Menuiserie aluminium coulissante', ref: 'MEN-ALU', unit: 'm²', price: 1250 },
    { product: 'Carrelage grès cérame 60×60', ref: 'CAR-6060', unit: 'm²', price: 185 },
    { product: 'Plaque de plâtre BA13', ref: 'PLA-BA13', unit: 'pièce', price: 58 },
    { product: 'Porte intérieure isoplane', ref: 'POR-ISO', unit: 'pièce', price: 1450 },
    { product: 'Faux plafond en staff', ref: 'STA-FP', unit: 'm²', price: 140 },
  ],
  'Électricité': [
    { product: 'Câble U-1000 R2V 3G2,5 (couronne 100 m)', ref: 'CAB-3G25', unit: 'pièce', price: 890 },
    { product: 'Tableau électrique 4 rangées', ref: 'TAB-4R', unit: 'pièce', price: 3200 },
    { product: 'Disjoncteur différentiel 30 mA', ref: 'DIS-30', unit: 'pièce', price: 420 },
    { product: 'Projecteur LED chantier 200 W', ref: 'LED-200', unit: 'pièce', price: 650 },
  ],
  Plomberie: [
    { product: 'Tube PVC Ø100 (barre 4 m)', ref: 'PVC-100', unit: 'pièce', price: 95 },
    { product: 'Tube multicouche Ø16 (couronne 100 m)', ref: 'MUL-16', unit: 'pièce', price: 1350 },
    { product: 'Robinetterie sanitaire (lot appartement)', ref: 'ROB-LOT', unit: 'lot', price: 6500 },
    { product: 'Pompe de relevage 1,1 kW', ref: 'POM-11', unit: 'pièce', price: 7800 },
  ],
  Finitions: [
    { product: 'Enduit monocouche façade (sac 25 kg)', ref: 'END-MONO', unit: 'pièce', price: 115 },
    { product: 'Isolant laine de roche 100 mm', ref: 'ISO-LR100', unit: 'm²', price: 92 },
    { product: 'Membrane d’étanchéité bitumineuse', ref: 'ETA-BIT', unit: 'm²', price: 135 },
    { product: 'Peinture façade acrylique (seau 20 L)', ref: 'PEI-FAC20', unit: 'pièce', price: 720 },
  ],
};

/** Fournisseurs (index dans SUPPLIERS du seed) par famille */
const FAMILY_SUPPLIERS: Record<string, number[]> = {
  'Gros œuvre': [0, 1],
  'Second œuvre': [3, 5],
  'Électricité': [2],
  Plomberie: [4],
  Finitions: [7, 5],
};

const PURCHASE_PLAN = [
  'paye', 'paye', 'facture', 'valide', 'livre', 'soumis', 'elabore', 'paye', 'archive', 'facture',
  'livre', 'soumis', 'paye', 'valide', 'facture', 'paye', 'soumis', 'livre', 'archive', 'paye',
  'elabore', 'valide', 'facture', 'paye', 'livre', 'soumis', 'paye', 'archive', 'facture', 'valide',
  'paye', 'elabore', 'soumis', 'livre', 'paye', 'facture',
] as const;

const PURCHASE_FLOW = ['elabore', 'soumis', 'livre', 'valide', 'facture', 'paye', 'archive'];

const STATUS_AGE: Record<string, [number, number]> = {
  elabore: [0, 4],
  soumis: [3, 12],
  livre: [8, 20],
  valide: [12, 28],
  facture: [18, 40],
  paye: [25, 75],
  archive: [80, 110],
};

const REQUESTERS = ['Hassan Tazi', 'Mohamed El Amrani', 'Omar Fassi', 'Nadia Cherkaoui', 'Youssef Alaoui'];
const PAY_MODES = ['virement', 'cheque', 'especes', 'virement'];

function lineQuantity(item: CatalogItem, seed: number) {
  if (item.unit === 'lot') return 1 + (seed % 3);
  if (item.unit === 'tonne') return 2 + (seed % 7);
  if (item.unit === 'm³') return 12 + ((seed * 7) % 45);
  if (item.unit === 'm²') return 40 + ((seed * 13) % 260);
  if (item.price < 20) return 800 + ((seed * 97) % 2400);
  if (item.price < 200) return 60 + ((seed * 31) % 340);
  if (item.price < 1000) return 8 + ((seed * 5) % 40);
  return 2 + (seed % 8);
}

async function resetPurchase(ctx: SeedContext, reference: string) {
  const { prisma } = ctx;
  const existing = await prisma.purchase.findUnique({
    where: { reference },
    select: { id: true, payments: { select: { id: true } } },
  });
  if (!existing) return;
  for (const p of existing.payments) await removeAutomaticMovement('achat_paiement', p.id);
  await removeAutomaticMovement('achat', existing.id);
  await prisma.purchasePayment.deleteMany({ where: { purchaseId: existing.id } });
  await prisma.purchaseDelivery.deleteMany({ where: { purchaseId: existing.id } });
  await prisma.purchaseLine.deleteMany({ where: { purchaseId: existing.id } });
  await prisma.purchaseHistory.deleteMany({ where: { purchaseId: existing.id } });
  await prisma.document.deleteMany({ where: { entityType: 'purchase', entityId: existing.id } });
}

export async function seedPurchases(ctx: SeedContext) {
  const { prisma, chantiers, supplierIds } = ctx;
  const suppliers = await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, companyName: true } });
  const supplierName = new Map(suppliers.map((s) => [s.id, s.companyName]));
  const families = Object.keys(PURCHASE_CATALOG);
  let paymentsCount = 0;
  let deliveriesCount = 0;

  for (let i = 1; i <= PURCHASE_PLAN.length; i++) {
    const status = PURCHASE_PLAN[i - 1];
    const statusIdx = PURCHASE_FLOW.indexOf(status);
    const reference = `ACH-2026-${pad(i)}`;
    const family = families[i % families.length];
    const catalog = PURCHASE_CATALOG[family];
    const famSuppliers = FAMILY_SUPPLIERS[family];
    const supplierId = supplierIds[famSuppliers[i % famSuppliers.length]];
    const chantier = chantiers[i % chantiers.length];
    const tranche = chantier.tranches.length ? chantier.tranches[i % chantier.tranches.length] : null;
    const [minAge, maxAge] = STATUS_AGE[status];
    const age = minAge + ((i * 7) % (maxAge - minAge + 1));
    const date = utcDaysAgo(age);

    const lineCount = Math.min(catalog.length, 1 + (i % 4));
    const raw = Array.from({ length: lineCount }, (_, k) => {
      const item = catalog[(i + k * 2) % catalog.length];
      return {
        product: item.product,
        reference: item.ref,
        family,
        quantity: lineQuantity(item, i + k),
        unit: item.unit,
        unitPrice: item.price,
        tvaRate: 20,
      };
    });
    const { lines, error } = normalizeLines(raw);
    if (error) throw new Error(`${reference} : ${error}`);
    const summary = summarizeLines(lines);

    await resetPurchase(ctx, reference);
    const data = {
      date,
      ...summary,
      supplierId,
      chantierId: chantier.id,
      tranche,
      projectId: chantier.projectId,
      status,
      requester: REQUESTERS[i % REQUESTERS.length],
      responsible: chantier.manager,
      expectedDeliveryDate: addDays(date, 5 + (i % 6)),
      author: 'admin@gic.ma',
      paymentMode: PAY_MODES[i % PAY_MODES.length],
      invoiced: statusIdx >= PURCHASE_FLOW.indexOf('facture'),
      advanceAmount: 0,
      paidAmount: 0,
      remark: i % 6 === 0 ? 'Livraison sur chantier avant 10h — accès par l’entrée secondaire' : null,
    };
    const purchase = await prisma.purchase.upsert({
      where: { reference },
      update: data,
      create: { reference, ...data },
    });

    const createdLines = [];
    for (let k = 0; k < lines.length; k++) {
      createdLines.push(
        await prisma.purchaseLine.create({ data: { id: `pl-${reference}-${k + 1}`, purchaseId: purchase.id, ...lines[k] } }),
      );
    }

    // Livraisons
    let lastDeliveryDate = date;
    let validatedWithRemainder = false;
    if (statusIdx >= PURCHASE_FLOW.indexOf('livre')) {
      const partialOnly = status === 'livre' && i % 2 === 0;
      const split = !partialOnly && (lines.length > 1 || i % 3 === 0);
      const withRejection = statusIdx >= PURCHASE_FLOW.indexOf('valide') && i % 5 === 0;
      const d1 = minDate(addDays(date, 3 + (i % 4)), today());
      const firstShare = partialOnly ? 0.6 : split ? 0.5 : 1;
      await prisma.purchaseDelivery.create({
        data: {
          id: `pd-${reference}-1`,
          purchaseId: purchase.id,
          date: d1,
          number: `BL-${pad(1000 + i * 2 - 1, 5)}`,
          remark: withRejection ? 'Réserves à la réception — articles abîmés refusés' : partialOnly ? 'Livraison partielle — reliquat attendu' : null,
          createdBy: 'Karim Tazi',
          items: {
            create: createdLines.map((l) => {
              const qty = round2(Math.max(1, Math.round(l.quantity * firstShare)));
              return {
                lineId: l.id,
                quantity: qty,
                rejectedQuantity: withRejection && !split ? round2(Math.max(1, Math.round(qty * 0.04))) : 0,
                remark: withRejection && !split ? 'Casse au déchargement' : null,
              };
            }),
          },
        },
      });
      deliveriesCount++;
      lastDeliveryDate = d1;
      validatedWithRemainder = withRejection && !split;
      if (split) {
        const d2 = minDate(addDays(d1, 4 + (i % 3)), today());
        await prisma.purchaseDelivery.create({
          data: {
            id: `pd-${reference}-2`,
            purchaseId: purchase.id,
            date: d2,
            number: `BL-${pad(1000 + i * 2, 5)}`,
            remark: 'Solde de la commande',
            createdBy: 'Karim Tazi',
            items: {
              create: createdLines.map((l) => ({
                lineId: l.id,
                quantity: round2(l.quantity - Math.max(1, Math.round(l.quantity * firstShare))),
                rejectedQuantity: 0,
              })).filter((it) => it.quantity > 0),
            },
          },
        });
        deliveriesCount++;
        lastDeliveryDate = d2;
      }
    }

    // Facture fournisseur (obligatoire à partir de « Facturé »)
    const invoiceDate = minDate(addDays(lastDeliveryDate, 2), today());
    if (statusIdx >= PURCHASE_FLOW.indexOf('facture')) {
      const fileName = `demo-facture-${reference}.pdf`;
      const filePath = writeDemoPdf(ctx.uploadDir, fileName, `Facture fournisseur ${reference}`, [
        `Fournisseur : ${supplierName.get(supplierId) || ''}`,
        `Chantier : ${chantier.name}${tranche ? ` - ${tranche}` : ''}`,
        ...lines.map((l) => `${l.product} : ${l.quantity} ${l.unit || ''} x ${l.unitPrice} MAD HT`),
        `Total TTC : ${summary.totalPrice.toLocaleString('fr-FR')} MAD`,
      ]);
      await prisma.document.create({
        data: {
          id: `doc-ach-${reference}`,
          name: `Facture ${supplierName.get(supplierId) || 'fournisseur'} — ${reference}`,
          category: 'facture_fournisseur',
          status: 'valid',
          mimeType: 'application/pdf',
          size: 24_000 + i * 310,
          path: filePath,
          entityType: 'purchase',
          entityId: purchase.id,
          supplierId,
          chantierId: chantier.id,
          docNumber: `FAC-${pad(4200 + i, 5)}`,
          docDate: invoiceDate,
          amount: summary.totalPrice,
          uploadedByName: ADMIN_NAME,
          createdAt: invoiceDate,
        },
      });
    }

    // Paiements (avance / complément / solde) → décaissements caisse
    const total = summary.totalPrice;
    const payments: Array<{ kind: string; amount: number; date: Date }> = [];
    const advance = round2(total * 0.3);
    if (status === 'soumis' && i % 2 === 0) payments.push({ kind: 'avance', amount: advance, date: minDate(addDays(date, 1), today()) });
    if ((status === 'livre' || status === 'valide') && i % 3 !== 0) payments.push({ kind: 'avance', amount: advance, date: minDate(addDays(date, 1), today()) });
    if (status === 'facture') {
      payments.push({ kind: 'avance', amount: advance, date: minDate(addDays(date, 1), today()) });
      if (i % 2 === 0) payments.push({ kind: 'complement', amount: round2(total * 0.4), date: invoiceDate });
    }
    if (status === 'paye' || status === 'archive') {
      if (i % 2 === 0) {
        payments.push({ kind: 'avance', amount: advance, date: minDate(addDays(date, 1), today()) });
        payments.push({ kind: 'solde', amount: round2(total - advance), date: minDate(addDays(invoiceDate, 3), today()) });
      } else {
        payments.push({ kind: 'solde', amount: total, date: minDate(addDays(invoiceDate, 3), today()) });
      }
    }
    const paymentIds: string[] = [];
    for (let k = 0; k < payments.length; k++) {
      const p = payments[k];
      const mode = PAY_MODES[(i + k) % PAY_MODES.length];
      const pay = await prisma.purchasePayment.create({
        data: {
          id: `pp-${reference}-${k + 1}`,
          purchaseId: purchase.id,
          kind: p.kind,
          date: p.date,
          amount: p.amount,
          mode,
          reference: mode === 'cheque' ? `CHQ-${pad(560000 + i * 10 + k, 7)}` : mode === 'virement' ? `VIR-${pad(88000 + i * 10 + k, 6)}` : null,
          remark: p.kind === 'avance' ? 'Avance à la commande' : p.kind === 'solde' ? 'Règlement du solde' : 'Paiement partiel sur facture',
          createdBy: ADMIN_NAME,
          createdAt: p.date,
        },
      });
      paymentIds.push(pay.id);
      paymentsCount++;
    }

    // Historique des étapes
    const steps = PURCHASE_FLOW.slice(0, statusIdx + 1);
    const span = Math.max(1, Math.round((today().getTime() - date.getTime()) / DAY));
    for (let k = 0; k < steps.length; k++) {
      const at = addDays(date, Math.min(span, Math.round((span * k) / Math.max(1, steps.length - 1))));
      const isValidation = steps[k] === 'valide';
      await prisma.purchaseHistory.create({
        data: {
          id: `ph-${reference}-${k + 1}`,
          purchaseId: purchase.id,
          userName: 'admin@gic.ma',
          oldStatus: k === 0 ? null : steps[k - 1],
          newStatus: steps[k],
          comment:
            k === 0
              ? 'Création de la demande d’achat'
              : isValidation && validatedWithRemainder
                ? 'Validé avec reliquat (articles refusés à la livraison)'
                : steps[k] === 'soumis'
                  ? 'Bon de commande émis au fournisseur'
                  : null,
          createdAt: at,
        },
      });
    }

    await recomputePurchase(purchase.id);
    for (const pid of paymentIds) await syncPaymentMovement(pid);
  }

  return { purchases: PURCHASE_PLAN.length, deliveries: deliveriesCount, payments: paymentsCount };
}

// ─── Parc Engins & Matériels ────────────────────────────────────────

type AssignmentPlan = {
  ch: number;
  tr?: number;
  start: number;
  end: number | null;
  returned?: 'bon' | 'usure' | 'a_reparer' | 'hors_service';
  method?: 'horaire';
  remark?: string;
};

type RepairPlan = { nature: string; designation: string; repairer: string; parts: number; labor: number; downtime: number; daysAgo: number };

type FleetSeed = {
  code: string;
  kind: 'engin' | 'materiel';
  designation: string;
  brand: string;
  genre: string;
  model: string;
  groupe: string;
  mat?: string;
  status: string;
  fuel?: number;
  counterUnit: 'KM' | 'Hr';
  counter: number;
  owned?: { price: number; years: number; method?: 'lineaire' | 'degressif'; acqDays: number; hourly?: number };
  rental?: { unit: 'jour' | 'semaine' | 'mois' | 'projet'; price: number; startDays: number; endDays: number; contract: string; transport?: number; deposit?: number; extra?: number; insurance?: number; terms: string };
  driver?: number;
  fuelLogs?: boolean;
  plans: AssignmentPlan[];
  repairs?: RepairPlan[];
};

const FLEET: FleetSeed[] = [
  {
    code: 'ENG-2026-000001', kind: 'engin', designation: 'Pelle hydraulique Caterpillar 320', brand: 'Caterpillar', genre: 'Pelle hydraulique', model: '320 GC',
    groupe: 'Terrassement', mat: '12345-A-6', status: 'en_utilisation', fuel: 75, counterUnit: 'Hr', counter: 4200,
    owned: { price: 1_450_000, years: 7, acqDays: 540, hourly: 380 }, driver: 0, fuelLogs: true,
    plans: [
      { ch: 1, tr: 0, start: 120, end: 70, returned: 'bon', remark: 'Terrassement général tranche 1' },
      { ch: 0, tr: 0, start: 40, end: -20, remark: 'Fouilles en rigole bloc A' },
    ],
  },
  {
    code: 'ENG-2026-000002', kind: 'engin', designation: 'Chargeuse sur pneus Volvo L90', brand: 'Volvo', genre: 'Chargeuse', model: 'L90H',
    groupe: 'Terrassement', mat: '67890-B-1', status: 'disponible', fuel: 45, counterUnit: 'Hr', counter: 3100,
    owned: { price: 1_250_000, years: 6, method: 'degressif', acqDays: 400, hourly: 320 }, driver: 1, fuelLogs: true,
    plans: [
      { ch: 2, tr: 1, start: 100, end: 60, returned: 'usure', remark: 'Chargement déblais' },
      { ch: 2, tr: 0, start: 30, end: null, method: 'horaire', remark: 'Approvisionnement agrégats — facturé à l’heure' },
    ],
    repairs: [{ nature: 'Fuite hydraulique vérin de levage', designation: 'Remplacement joints vérin de levage', repairer: 'Concession Volvo CE Casablanca', parts: 6400, labor: 2800, downtime: 3, daysAgo: 64 }],
  },
  {
    code: 'ENG-2026-000003', kind: 'engin', designation: 'Camion benne Mercedes Actros', brand: 'Mercedes', genre: 'Camion benne', model: 'Actros 3341',
    groupe: 'Transport', mat: '11223-C-8', status: 'disponible', fuel: 60, counterUnit: 'KM', counter: 186_000,
    owned: { price: 980_000, years: 5, acqDays: 700 }, driver: 2, fuelLogs: true,
    plans: [
      { ch: 0, tr: 1, start: 90, end: 50, returned: 'bon', remark: 'Évacuation des terres' },
      { ch: 3, tr: 0, start: 25, end: -35, remark: 'Transport matériaux Oasis phase 1' },
    ],
  },
  {
    code: 'ENG-2026-000004', kind: 'engin', designation: 'Mini-pelle JCB 8026', brand: 'JCB', genre: 'Mini-pelle', model: '8026 CTS',
    groupe: 'Terrassement', mat: '44556-D-2', status: 'en_maintenance', fuel: 20, counterUnit: 'Hr', counter: 1850,
    owned: { price: 420_000, years: 5, acqDays: 300, hourly: 190 }, fuelLogs: true,
    plans: [{ ch: 4, start: 70, end: 20, returned: 'a_reparer', remark: 'Tranchées réseaux VRD' }],
  },
  {
    code: 'ENG-2026-000005', kind: 'engin', designation: 'Bulldozer Komatsu D65', brand: 'Komatsu', genre: 'Bulldozer', model: 'D65EX-18',
    groupe: 'Terrassement', mat: '77889-E-5', status: 'disponible', fuel: 80, counterUnit: 'Hr', counter: 6100,
    owned: { price: 1_850_000, years: 8, acqDays: 900, hourly: 450 }, driver: 3, fuelLogs: true,
    plans: [
      { ch: 4, start: 20, end: -40, remark: 'Décapage et nivellement plateforme' },
      { ch: 2, tr: 2, start: -15, end: -60, remark: 'Préparation terrain tranche 3' },
    ],
    repairs: [{ nature: 'Usure chenille gauche', designation: 'Remplacement galets et tension chenille', repairer: 'Garage Partenaire Fès', parts: 14200, labor: 4600, downtime: 4, daysAgo: 35 }],
  },
  {
    code: 'ENG-2026-000006', kind: 'engin', designation: 'Nacelle articulée Manitou 180', brand: 'Manitou', genre: 'Nacelle', model: '180 ATJ',
    groupe: 'Levage', mat: '33445-F-3', status: 'disponible', fuel: 55, counterUnit: 'Hr', counter: 950,
    owned: { price: 690_000, years: 6, acqDays: 250, hourly: 210 }, fuelLogs: true,
    plans: [{ ch: 1, tr: 1, start: 45, end: 3, remark: 'Pose menuiseries façade — retour à organiser' }],
  },
  {
    code: 'ENG-2026-000007', kind: 'engin', designation: 'Camion benne Renault Kerax', brand: 'Renault', genre: 'Camion benne', model: 'Kerax 440',
    groupe: 'Transport', mat: '55667-G-4', status: 'en_reparation', fuel: 35, counterUnit: 'KM', counter: 64_000,
    owned: { price: 860_000, years: 5, acqDays: 180 }, driver: 4, fuelLogs: true,
    plans: [{ ch: 1, tr: 0, start: 60, end: 15, returned: 'a_reparer', remark: 'Transport gravats' }],
    repairs: [{ nature: 'Embrayage patine', designation: 'Remplacement kit embrayage + volant moteur', repairer: 'Renault Trucks Tanger', parts: 18600, labor: 5200, downtime: 6, daysAgo: 2 }],
  },
  {
    code: 'ENG-2026-000008', kind: 'engin', designation: 'Grue à tour Potain MDT 219', brand: 'Potain', genre: 'Grue à tour', model: 'MDT 219 J10',
    groupe: 'Levage', status: 'en_utilisation', counterUnit: 'Hr', counter: 2400,
    rental: { unit: 'mois', price: 42_000, startDays: 80, endDays: -40, contract: 'CTR-LEM-2026-014', transport: 8000, deposit: 25_000, extra: 3000, insurance: 2500, terms: 'Paiement mensuel à 30 jours — montage/démontage inclus' },
    plans: [{ ch: 1, tr: 0, start: 80, end: -40, remark: 'Levage gros œuvre R+4' }],
  },
  {
    code: 'ENG-2026-000009', kind: 'engin', designation: 'Compacteur Bomag BW 211', brand: 'Bomag', genre: 'Compacteur', model: 'BW 211 D-5',
    groupe: 'Compactage', mat: '99001-H-7', status: 'disponible', fuel: 65, counterUnit: 'Hr', counter: 5300,
    rental: { unit: 'jour', price: 1600, startDays: 18, endDays: -12, contract: 'CTR-LEM-2026-027', transport: 2500, deposit: 5000, terms: 'Facturation hebdomadaire — carburant à la charge du locataire' },
    fuelLogs: true,
    plans: [{ ch: 4, start: 18, end: -12, remark: 'Compactage couche de forme voirie' }],
  },
  {
    code: 'ENG-2026-000010', kind: 'engin', designation: 'Camion toupie Liebherr HTM 904', brand: 'Liebherr', genre: 'Camion toupie', model: 'HTM 904',
    groupe: 'Bétonnage', mat: '88112-B-6', status: 'disponible', fuel: 50, counterUnit: 'KM', counter: 98_000,
    rental: { unit: 'projet', price: 58_000, startDays: 35, endDays: -25, contract: 'CTR-LEM-2026-019', transport: 0, deposit: 10_000, terms: 'Forfait projet — chauffeur fourni par le loueur' },
    fuelLogs: true,
    plans: [{ ch: 2, tr: 1, start: 35, end: -25, remark: 'Coulage dalles tranche 2 (forfait)' }],
  },
  {
    code: 'MAT-2026-000001', kind: 'materiel', designation: 'Bétonnière Altrad 350 L', brand: 'Altrad', genre: 'Bétonnière', model: 'B 350',
    groupe: 'Bétonnage', status: 'disponible', counterUnit: 'Hr', counter: 1250,
    owned: { price: 18_500, years: 4, acqDays: 420, hourly: 25 },
    plans: [
      { ch: 3, tr: 1, start: 140, end: 60, returned: 'usure', remark: 'Maçonnerie villas' },
      { ch: 0, tr: 1, start: 50, end: null, remark: 'Gâchage mortier tranche 2' },
    ],
  },
  {
    code: 'MAT-2026-000002', kind: 'materiel', designation: 'Groupe électrogène SDMO 60 kVA', brand: 'SDMO', genre: 'Groupe électrogène', model: 'J66K',
    groupe: 'Énergie', status: 'en_utilisation', fuel: 70, counterUnit: 'Hr', counter: 5200,
    owned: { price: 145_000, years: 6, method: 'degressif', acqDays: 600, hourly: 95 }, fuelLogs: true,
    plans: [{ ch: 2, tr: 0, start: 60, end: -30, method: 'horaire', remark: 'Alimentation base vie et outillage' }],
  },
  {
    code: 'MAT-2026-000003', kind: 'materiel', designation: 'Compresseur Atlas Copco XAS 97', brand: 'Atlas Copco', genre: 'Compresseur', model: 'XAS 97',
    groupe: 'Énergie', status: 'disponible', fuel: 60, counterUnit: 'Hr', counter: 2100,
    owned: { price: 128_000, years: 6, acqDays: 350, hourly: 70 }, fuelLogs: true,
    plans: [{ ch: 3, tr: 1, start: 15, end: -15, remark: 'Démolition et piquage' }],
  },
  {
    code: 'MAT-2026-000004', kind: 'materiel', designation: 'Vibreur à béton Wacker IREN 45', brand: 'Wacker Neuson', genre: 'Vibreur à béton', model: 'IREN 45',
    groupe: 'Bétonnage', status: 'disponible', counterUnit: 'Hr', counter: 640,
    owned: { price: 9_800, years: 3, acqDays: 200 },
    plans: [{ ch: 0, tr: 0, start: 40, end: -20, remark: 'Vibration voiles et poteaux' }],
  },
  {
    code: 'MAT-2026-000005', kind: 'materiel', designation: 'Dameuse Wacker BS 60', brand: 'Wacker Neuson', genre: 'Dameuse', model: 'BS 60-4s',
    groupe: 'Compactage', status: 'disponible', counterUnit: 'Hr', counter: 880,
    owned: { price: 24_000, years: 4, acqDays: 260 },
    plans: [
      { ch: 4, start: 50, end: 25, returned: 'bon', remark: 'Compactage tranchées' },
      { ch: 3, tr: 0, start: -7, end: -30, remark: 'Remblais périphériques' },
    ],
  },
  {
    code: 'MAT-2026-000006', kind: 'materiel', designation: 'Marteau-piqueur Hilti TE 3000', brand: 'Hilti', genre: 'Marteau-piqueur', model: 'TE 3000-AVR',
    groupe: 'Petit matériel', status: 'hors_service', counterUnit: 'Hr', counter: 1420,
    owned: { price: 21_500, years: 3, acqDays: 150 },
    plans: [{ ch: 1, tr: 1, start: 90, end: 40, returned: 'hors_service', remark: 'Reprise de dalle' }],
    repairs: [{ nature: 'Moteur grillé', designation: 'Diagnostic moteur — réparation non rentable', repairer: 'Hilti Service Casablanca', parts: 0, labor: 650, downtime: 30, daysAgo: 38 }],
  },
  {
    code: 'MAT-2026-000007', kind: 'materiel', designation: 'Scie à sol Husqvarna FS 400', brand: 'Husqvarna', genre: 'Scie à sol', model: 'FS 400 LV',
    groupe: 'Petit matériel', status: 'disponible', counterUnit: 'Hr', counter: 310,
    owned: { price: 32_000, years: 4, acqDays: 90 },
    plans: [{ ch: 4, start: 10, end: -20, remark: 'Sciage enrobé raccordements' }],
  },
  {
    code: 'MAT-2026-000008', kind: 'materiel', designation: 'Échafaudage de façade Layher (400 m²)', brand: 'Layher', genre: 'Échafaudage', model: 'Blitz 70',
    groupe: 'Accès & sécurité', status: 'disponible', counterUnit: 'Hr', counter: 0,
    rental: { unit: 'semaine', price: 3500, startDays: 50, endDays: -20, contract: 'CTR-LEM-2026-021', transport: 4000, deposit: 10_000, extra: 1500, terms: 'Facturation à la semaine — montage par l’équipe GIC' },
    plans: [{ ch: 1, tr: 1, start: 50, end: -20, remark: 'Ravalement façades bâtiment B' }],
  },
  {
    code: 'MAT-2026-000009', kind: 'materiel', designation: 'Coffrage métallique Outinord (lot)', brand: 'Outinord', genre: 'Coffrage', model: 'Banches 2,80 m',
    groupe: 'Bétonnage', status: 'disponible', counterUnit: 'Hr', counter: 0,
    rental: { unit: 'mois', price: 18_000, startDays: 95, endDays: 5, contract: 'CTR-LEM-2026-009', transport: 6000, deposit: 15_000, terms: 'Mensuel — restitution nettoyée' },
    plans: [{ ch: 2, tr: 0, start: 95, end: 5, remark: 'Voiles béton R+2 — à restituer au loueur' }],
  },
];

const FUEL_STATIONS = ['Afriquia Aïn Sebaâ', 'Total Energies Route de Rabat', 'Shell Tanger Med', 'Winxo Marrakech', 'Cuve chantier GIC'];
const CITY_COORDS: Record<string, [number, number]> = {
  Casablanca: [33.5731, -7.5898],
  Tanger: [35.7595, -5.834],
  Marrakech: [31.6295, -7.9811],
  'Fès': [34.0331, -5.0003],
};
const MAINT_TYPES: Array<{ type: string; label: string }> = [
  { type: 'graissage', label: 'Graissage général' },
  { type: 'filtres', label: 'Remplacement filtres air / gasoil' },
  { type: 'pneus', label: 'Contrôle et permutation pneumatiques' },
  { type: 'preventive', label: 'Visite préventive 500 h' },
  { type: 'revision', label: 'Révision complète' },
  { type: 'controle_technique', label: 'Contrôle technique interne' },
];
const USAGE_REMARKS = ['Travaux selon planning', 'Intervention demandée par le chef de chantier', 'Arrêt 1 h pour ravitaillement', 'Météo favorable — cadence normale', 'Travail en double poste'];

async function resetEnginActivity(ctx: SeedContext, enginId: string) {
  const { prisma } = ctx;
  const [fuel, maint, exp] = await Promise.all([
    prisma.fuelLog.findMany({ where: { enginId }, select: { id: true } }),
    prisma.maintenance.findMany({ where: { enginId }, select: { id: true } }),
    prisma.enginExpense.findMany({ where: { enginId }, select: { id: true } }),
  ]);
  for (const f of fuel) await removeAutomaticMovement('carburant', f.id);
  for (const m of maint) await removeAutomaticMovement('maintenance', m.id);
  for (const e of exp) await removeAutomaticMovement('engin_depense', e.id);
  await prisma.enginUsage.deleteMany({ where: { enginId } });
  await prisma.enginAssignment.deleteMany({ where: { enginId } });
  await prisma.enginExpense.deleteMany({ where: { enginId } });
  await prisma.fuelLog.deleteMany({ where: { enginId } });
  await prisma.document.deleteMany({
    where: { OR: [{ enginId }, { entityType: 'Maintenance', entityId: { in: maint.map((m) => m.id) } }] },
  });
  await prisma.maintenance.deleteMany({ where: { enginId } });
  await prisma.mission.deleteMany({ where: { enginId } });
  await prisma.gpsPosition.deleteMany({ where: { enginId } });
  await prisma.driverAssignment.deleteMany({ where: { enginId } });
}

function expiryFor(idx: number, kind: 'insurance' | 'visit') {
  if (kind === 'insurance') {
    if (idx % 6 === 0) return utcDaysAgo(8);
    if (idx % 6 === 1) return utcDaysAgo(-18);
    return utcDaysAgo(-(120 + idx * 9));
  }
  return idx % 5 === 2 ? utcDaysAgo(-25) : utcDaysAgo(-(200 + idx * 7));
}

function fmtTime(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export async function seedFleet(ctx: SeedContext) {
  const { prisma, chantiers, supplierIds, chauffeurs } = ctx;
  const rentalSupplierId = supplierIds[6] || null;
  const stats = { engins: 0, assignments: 0, usages: 0, fuel: 0, maintenances: 0, repairs: 0, expenses: 0, documents: 0 };

  for (let idx = 0; idx < FLEET.length; idx++) {
    const f = FLEET[idx];
    const owned = f.owned;
    const rental = f.rental;
    const acquisitionDate = owned ? utcDaysAgo(owned.acqDays) : null;
    const insuranceExpiry = f.kind === 'engin' || (owned && owned.price >= 100_000) ? expiryFor(idx, 'insurance') : null;
    const visitExpiry = f.mat ? expiryFor(idx, 'visit') : null;
    const isTruck = f.genre.startsWith('Camion');
    const data = {
      code: f.code,
      kind: f.kind,
      designation: f.designation,
      brand: f.brand,
      genre: f.genre,
      model: f.model,
      groupe: f.groupe,
      matricule: f.mat ?? null,
      status: f.status,
      ownershipType: rental ? 'loue' : 'personnel',
      location: rental ? 'Livré sur chantier par le loueur' : f.kind === 'engin' ? 'Parc GIC — Aïn Sebaâ, Casablanca' : 'Magasin matériel GIC — Casablanca',
      fuelLevel: f.fuel ?? null,
      counterUnit: f.counterUnit,
      counterValue: f.counter,
      counterDate: today(),
      acquisitionYear: acquisitionDate ? acquisitionDate.getUTCFullYear() : null,
      acquisitionDate,
      commissioningDate: acquisitionDate ? addDays(acquisitionDate, 7) : rental ? utcDaysAgo(rental.startDays) : null,
      transferDate: acquisitionDate,
      purchasePrice: owned?.price ?? null,
      residualValue: owned ? Math.round(owned.price * 0.1) : null,
      depreciationYears: owned?.years ?? null,
      depreciationMethod: owned ? owned.method || 'lineaire' : null,
      usageCostPerHour: owned?.hourly ?? null,
      rentalSupplier: rental ? 'Location Engins Maroc' : null,
      rentalSupplierId: rental ? rentalSupplierId : null,
      rentalContractRef: rental?.contract ?? null,
      rentalStart: rental ? utcDaysAgo(rental.startDays) : null,
      rentalEnd: rental ? utcDaysAgo(rental.endDays) : null,
      rentalPrice: rental?.price ?? null,
      rentalUnit: rental?.unit ?? null,
      rentalMonthly: rental?.unit === 'mois' ? rental.price : null,
      rentalDeposit: rental?.deposit ?? null,
      rentalTransport: rental?.transport ?? null,
      rentalExtraFees: rental?.extra ?? null,
      rentalInsurance: rental?.insurance ?? null,
      rentalTvaRate: rental ? 20 : null,
      rentalPaymentTerms: rental?.terms ?? null,
      chassisNo: f.kind === 'engin' ? `VF${f.brand.slice(0, 3).toUpperCase()}${pad(482_100 + idx * 713, 9)}` : null,
      emptyWeight: isTruck ? 12_500 : f.kind === 'engin' ? 8_000 + idx * 1_700 : null,
      totalWeight: isTruck ? 33_000 : null,
      gsmNumber: f.kind === 'engin' ? `06${pad(61_200_000 + idx * 3_571, 8)}` : null,
      gpsNumber: f.kind === 'engin' ? `GPS-${pad(idx + 1, 4)}` : null,
      gpsMountDate: f.kind === 'engin' ? (acquisitionDate ? addDays(acquisitionDate, 10) : utcDaysAgo(rental?.startDays ?? 0)) : null,
      workPassport: f.kind === 'engin' ? `PO-${pad(idx + 1, 4)}` : null,
      insuranceExpiry,
      vignetteExpiry: f.mat ? utcDaysAgo(-95 + idx) : null,
      visitExpiry,
      authExpiry: isTruck ? utcDaysAgo(-(150 + idx * 5)) : null,
    };

    if (f.mat) {
      await prisma.engin.updateMany({
        where: { code: f.code, OR: [{ matricule: null }, { matricule: { not: f.mat } }] },
        data: { code: null },
      });
    }
    const existing = f.mat
      ? await prisma.engin.findUnique({ where: { matricule: f.mat } })
      : await prisma.engin.findUnique({ where: { code: f.code } });
    const engin: Engin = existing
      ? await prisma.engin.update({ where: { id: existing.id }, data })
      : await prisma.engin.create({ data });
    await resetEnginActivity(ctx, engin.id);
    stats.engins++;

    // Conducteurs attitrés
    const driver = f.driver != null ? chauffeurs[f.driver] : null;
    if (driver) {
      const prev = chauffeurs[(f.driver! + 2) % chauffeurs.length];
      if (prev && prev.id !== driver.id) {
        await prisma.driverAssignment.create({
          data: { workforceId: prev.id, enginId: engin.id, startDate: utcDaysAgo(210 + idx * 3), endDate: utcDaysAgo(95 + idx), remark: 'Ancien conducteur attitré' },
        });
      }
      await prisma.driverAssignment.create({
        data: { workforceId: driver.id, enginId: engin.id, startDate: utcDaysAgo(94 + idx), remark: 'Conducteur attitré' },
      });
    }

    // Affectations + journal d'utilisation
    const assignments: Array<{ id: string; chantier: SeedChantier; tranche: string | null; start: Date; end: Date | null }> = [];
    let counter = f.counter;
    let km = f.counterUnit === 'KM' ? f.counter : 0;
    const usageRows: Prisma.EnginUsageCreateManyInput[] = [];
    for (let k = 0; k < f.plans.length; k++) {
      const p = f.plans[k];
      const chantier = chantiers[p.ch];
      const tranche = chantier.tranches.length ? chantier.tranches[(p.tr ?? 0) % chantier.tranches.length] : null;
      const startDate = utcDaysAgo(p.start);
      const endDate = p.end == null ? null : utcDaysAgo(p.end);
      const s = suggestAssignmentCost(engin, startDate);
      const costMethod = p.method ?? s.costMethod;
      const hourlyCost = costMethod === 'horaire' ? engin.usageCostPerHour ?? s.hourlyCost ?? 0 : s.hourlyCost;
      const base = {
        startDate,
        endDate,
        costMethod,
        dailyCost: s.dailyCost,
        hourlyCost,
        flatAmount: s.flatAmount,
        extraCost: s.extraCost,
        plannedCost: 0,
      };
      const plannedDays = inclusiveDays(startDate, endDate ?? utcDaysAgo(-30));
      const plannedCost = plannedCostOf(base, costMethod === 'horaire' ? plannedDays * 7 : null);
      const assignment = await prisma.enginAssignment.create({
        data: {
          id: `aff-${f.code}-${k + 1}`,
          enginId: engin.id,
          projectId: chantier.projectId,
          chantierId: chantier.id,
          tranche,
          responsible: chantier.manager,
          mode: s.mode,
          ...base,
          plannedCost,
          remark: p.remark ?? null,
          createdBy: ADMIN_NAME,
          createdAt: startDate,
        },
      });
      assignments.push({ id: assignment.id, chantier, tranche, start: startDate, end: endDate });
      stats.assignments++;

      if (startDate > today()) continue;
      const lastDay = minDate(endDate ?? today(), today());
      const from = maxDate(startDate, addDays(lastDay, -24));
      let dayIdx = 0;
      for (let d = from; d <= lastDay; d = addDays(d, 1), dayIdx++) {
        if (d.getUTCDay() === 0) continue;
        if (f.kind === 'materiel' && (dayIdx + idx) % 3 === 1) continue;
        const hours = f.kind === 'engin' ? 6 + ((dayIdx + idx) % 4) : 3 + ((dayIdx + idx) % 5);
        const dist = f.counterUnit === 'KM' ? hours * (14 + (idx % 5)) : 0;
        const counterStart = f.counterUnit === 'KM' ? km : counter;
        if (f.counterUnit === 'KM') km += dist;
        else counter += hours;
        usageRows.push({
          id: `use-${f.code}-${k + 1}-${dayIdx}`,
          enginId: engin.id,
          assignmentId: assignment.id,
          date: d,
          chantierId: chantier.id,
          tranche,
          driverId: f.kind === 'engin' && driver ? driver.id : null,
          driverName: f.kind === 'engin' ? driver?.name ?? 'Chauffeur du loueur' : null,
          startTime: '07:30',
          endTime: fmtTime(7.5 + hours + (hours > 5 ? 1 : 0)),
          hours,
          kmStart: f.counterUnit === 'KM' ? counterStart : null,
          kmEnd: f.counterUnit === 'KM' ? km : null,
          counterStart,
          counterEnd: f.counterUnit === 'KM' ? km : counter,
          remark: (dayIdx + idx) % 4 === 0 ? USAGE_REMARKS[(dayIdx + idx) % USAGE_REMARKS.length] : null,
          createdBy: ADMIN_NAME,
          createdAt: d,
        });
      }
      if (p.returned && endDate) {
        await prisma.enginAssignment.update({
          where: { id: assignment.id },
          data: {
            returnedAt: endDate,
            returnCondition: p.returned,
            returnCounter: f.counterUnit === 'KM' ? km : counter,
            returnRemark:
              p.returned === 'bon' ? 'Restitué propre, aucun dommage constaté'
                : p.returned === 'usure' ? 'Usure normale — godet à surveiller'
                  : p.returned === 'a_reparer' ? 'Anomalie signalée au retour — envoyé à l’atelier'
                    : 'Hors service au retour — réforme proposée',
          },
        });
      }
    }
    if (usageRows.length) {
      await prisma.enginUsage.createMany({ data: usageRows });
      stats.usages += usageRows.length;
    }
    const finalCounter = f.counterUnit === 'KM' ? km : counter;
    await prisma.engin.update({ where: { id: engin.id }, data: { counterValue: finalCounter } });

    const assignmentAt = (d: Date) => assignments.find((a) => a.start <= d && (a.end ?? today()) >= d) || null;
    const current = assignments.find((a) => a.start <= today() && (!a.end || a.end >= today())) || assignments[assignments.length - 1];

    // Carburant
    if (f.fuelLogs) {
      for (let k = 0; k < 6; k++) {
        const date = utcDaysAgo(2 + k * 8 + (idx % 4));
        const liters = f.kind === 'engin' ? 90 + ((k * 37 + idx * 11) % 170) : 40 + ((k * 13 + idx) % 50);
        const at = assignmentAt(date);
        const direct = k % 3 === 0 && at;
        await prisma.fuelLog.create({
          data: {
            id: `fuel-${f.code}-${k + 1}`,
            enginId: engin.id,
            date,
            liters,
            cost: round2(liters * 12.6),
            counterValue: Math.max(0, finalCounter - k * (f.counterUnit === 'KM' ? 480 : 55)),
            station: FUEL_STATIONS[(k + idx) % FUEL_STATIONS.length],
            allocation: direct ? 'direct' : 'reparti',
            chantierId: direct ? at!.chantier.id : null,
            tranche: direct ? at!.tranche : null,
            remark: k === 0 ? 'Plein complet' : null,
            createdAt: date,
          },
        });
        stats.fuel++;
      }
    }

    // Entretiens (parc en propriété)
    if (owned) {
      const small = owned.price < 100_000;
      const entries = [
        {
          date: utcDaysAgo(40 + (idx % 10)),
          maintenanceType: 'vidange',
          designation: 'Vidange moteur + filtres',
          budget: small ? 350 + idx * 20 : 1800 + idx * 120,
        },
        {
          date: utcDaysAgo(8 + (idx % 6)),
          maintenanceType: MAINT_TYPES[idx % MAINT_TYPES.length].type,
          designation: MAINT_TYPES[idx % MAINT_TYPES.length].label,
          budget: small ? 280 + idx * 15 : 1400 + idx * 150,
        },
      ];
      if (f.status === 'en_maintenance') {
        entries.push({ date: today(), maintenanceType: 'revision', designation: 'Révision générale 2 000 h', budget: 6800 });
      }
      for (let k = 0; k < entries.length; k++) {
        const e = entries[k];
        const at = assignmentAt(e.date);
        const direct = k === 1 && idx % 3 === 0 && at;
        await prisma.maintenance.create({
          data: {
            id: `mnt-${f.code}-${k + 1}`,
            enginId: engin.id,
            kind: 'entretien',
            date: e.date,
            maintenanceType: e.maintenanceType,
            designation: e.designation,
            description: `${e.designation} — ${f.designation}`,
            repairer: 'Atelier GIC',
            responsible: 'Atelier GIC',
            supervisor: 'Hassan Tazi',
            budget: e.budget,
            counterValue: Math.max(0, finalCounter - (entries.length - k) * 40),
            allocation: direct ? 'direct' : 'reparti',
            chantierId: direct ? at!.chantier.id : null,
            tranche: direct ? at!.tranche : null,
            invoiceRef: `BT-${pad(700 + idx * 3 + k, 5)}`,
            remark: e.date.getTime() === today().getTime() ? 'En cours à l’atelier — retour prévu sous 48 h' : null,
            createdAt: e.date,
          },
        });
        stats.maintenances++;
      }
    }

    // Réparations
    for (let k = 0; k < (f.repairs || []).length; k++) {
      const r = f.repairs![k];
      const date = utcDaysAgo(r.daysAgo);
      const at = assignmentAt(date);
      await prisma.maintenance.create({
        data: {
          id: `rep-${f.code}-${k + 1}`,
          enginId: engin.id,
          kind: 'reparation',
          date,
          breakdownNature: r.nature,
          designation: r.designation,
          description: `Panne constatée : ${r.nature}`,
          repairer: r.repairer,
          responsible: 'Atelier GIC',
          supervisor: 'Hassan Tazi',
          partsCost: r.parts,
          laborCost: r.labor,
          budget: r.parts + r.labor,
          downtimeDays: r.downtime,
          allocation: at ? 'direct' : 'reparti',
          chantierId: at ? at.chantier.id : null,
          tranche: at ? at.tranche : null,
          invoiceRef: `FAC-REP-${pad(310 + idx * 2 + k, 5)}`,
          counterValue: finalCounter,
          createdAt: date,
        },
      });
      stats.repairs++;
    }

    // Autres dépenses
    const expenses: Array<{ category: string; designation: string; amount: number; date: Date; supplier: string; direct?: boolean }> = [];
    if (insuranceExpiry) {
      expenses.push({
        category: 'assurance',
        designation: 'Prime d’assurance annuelle',
        amount: owned ? Math.round(owned.price * 0.011) : 4800,
        date: addDays(insuranceExpiry, -365),
        supplier: ['Wafa Assurance', 'AXA Assurance Maroc', 'RMA Assurance'][idx % 3],
      });
    }
    if (f.mat && owned) {
      expenses.push({ category: 'taxes', designation: 'Vignette et taxe à l’essieu 2026', amount: 2400 + (idx % 4) * 700, date: utcDaysAgo(58), supplier: 'DGI — Recette des impôts' });
    }
    if (owned && current && current.start <= today()) {
      expenses.push({
        category: 'transport',
        designation: `Transport vers ${current.chantier.name}`,
        amount: f.kind === 'engin' ? 2600 + (idx % 5) * 450 : 650 + (idx % 3) * 150,
        date: current.start,
        supplier: 'Trans Atlas Logistique',
        direct: true,
      });
    }
    if (f.kind === 'engin') {
      expenses.push({ category: 'lavage', designation: 'Lavage haute pression', amount: 350, date: utcDaysAgo(6 + (idx % 3)), supplier: 'Station lavage Aïn Sebaâ' });
    }
    if (isTruck && owned) {
      expenses.push({ category: 'pneumatiques', designation: 'Train de 4 pneus 315/80 R22.5', amount: 14_400, date: utcDaysAgo(26), supplier: 'Pneus Maroc Distribution' });
    }
    if (idx % 4 === 0 && current) {
      expenses.push({ category: 'gardiennage', designation: 'Gardiennage de nuit sur chantier', amount: 1500, date: utcDaysAgo(12), supplier: 'Sécurité Plus', direct: true });
    }
    if (rental) {
      expenses.push({ category: 'frais_admin', designation: 'Frais de dossier location', amount: 500, date: utcDaysAgo(rental.startDays), supplier: 'Location Engins Maroc' });
    }
    if (f.kind === 'materiel' && owned && owned.price < 50_000) {
      expenses.push({ category: 'pieces', designation: 'Pièces d’usure de rechange', amount: 450 + idx * 40, date: utcDaysAgo(19), supplier: 'Quincaillerie Derb Omar' });
    }
    for (let k = 0; k < expenses.length; k++) {
      const x = expenses[k];
      if (x.date > today()) continue;
      const at = x.direct ? assignmentAt(x.date) || current : null;
      const expense = await prisma.enginExpense.create({
        data: {
          id: `dep-${f.code}-${k + 1}`,
          enginId: engin.id,
          date: x.date,
          category: x.category,
          designation: x.designation,
          amount: x.amount,
          supplier: x.supplier,
          allocation: at ? 'direct' : 'reparti',
          chantierId: at ? at.chantier.id : null,
          tranche: at ? at.tranche : null,
          invoiceRef: `FAC-${pad(9100 + idx * 10 + k, 5)}`,
          paymentMode: PAY_MODES[(idx + k) % PAY_MODES.length],
          createdBy: ADMIN_NAME,
          createdAt: x.date,
        },
      });
      await syncEnginExpenseMovement({ ...expense, engin: { code: engin.code, designation: engin.designation, matricule: engin.matricule } });
      stats.expenses++;
    }

    // Missions + position GPS
    if (f.kind === 'engin') {
      for (let k = 0; k < 2; k++) {
        const date = utcDaysAgo(1 + idx * 2 + k * 9);
        const at = assignmentAt(date) || current;
        await prisma.mission.create({
          data: {
            enginId: engin.id,
            date,
            driverName: driver?.name ?? 'Chauffeur du loueur',
            mission: at ? `${at.chantier.name} — ${f.plans.find((p) => chantiers[p.ch].id === at.chantier.id)?.remark ?? 'Travaux'}` : 'Déplacement parc',
            usage: f.groupe,
            chantierId: at?.chantier.id ?? null,
            tranche: at?.tranche ?? null,
            requestedBy: at?.chantier.manager ?? 'Hassan Tazi',
          },
        });
      }
      const city = current?.chantier.city ?? 'Casablanca';
      const [lat, lng] = CITY_COORDS[city] || CITY_COORDS.Casablanca;
      await prisma.gpsPosition.create({
        data: { enginId: engin.id, lat: lat + (idx % 5) * 0.004, lng: lng + (idx % 3) * 0.004, source: idx % 2 === 0 ? 'gps_tracker' : 'manual', recordedAt: utcDaysAgo(idx % 3) },
      });
    }

    // Documents
    const docs: Array<{ category: string; name: string; number: string; date: Date; expiresAt?: Date | null; amount?: number | null }> = [];
    if (f.mat) docs.push({ category: 'carte_grise', name: `Carte grise ${f.mat}`, number: `CG-${f.mat}`, date: acquisitionDate ?? utcDaysAgo(rental?.startDays ?? 0) });
    if (insuranceExpiry) {
      docs.push({
        category: 'assurance',
        name: `Attestation d’assurance ${f.designation}`,
        number: `POL-2026-${pad(3300 + idx, 5)}`,
        date: addDays(insuranceExpiry, -365),
        expiresAt: insuranceExpiry,
        amount: owned ? Math.round(owned.price * 0.011) : 4800,
      });
    }
    if (visitExpiry) docs.push({ category: 'controle_technique', name: `Visite technique ${f.mat}`, number: `VT-${pad(51_000 + idx, 6)}`, date: addDays(visitExpiry, -365), expiresAt: visitExpiry });
    if (rental) {
      docs.push({
        category: 'contrat_location',
        name: `Contrat de location ${rental.contract}`,
        number: rental.contract,
        date: utcDaysAgo(rental.startDays),
        expiresAt: utcDaysAgo(rental.endDays),
        amount: rental.price,
      });
    }
    if (owned && owned.price >= 50_000 && acquisitionDate) {
      docs.push({ category: 'facture', name: `Facture d’acquisition ${f.designation}`, number: `FAC-ACQ-${pad(1200 + idx, 5)}`, date: acquisitionDate, amount: owned.price });
    }
    for (const d of docs) {
      const id = `doc-${f.code}-${d.category}`;
      const filePath = writeDemoPdf(ctx.uploadDir, `demo-${id}.pdf`, d.name, [
        `Engin : ${f.code} - ${f.designation}`,
        `N° document : ${d.number}`,
        `Date : ${d.date.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`,
        ...(d.expiresAt ? [`Expiration : ${d.expiresAt.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`] : []),
        ...(d.amount ? [`Montant : ${d.amount.toLocaleString('fr-FR')} MAD`] : []),
      ]);
      await prisma.document.create({
        data: {
          id,
          name: d.name,
          category: d.category,
          status: d.expiresAt && d.expiresAt < today() ? 'invalid' : 'valid',
          mimeType: 'application/pdf',
          size: 32_000 + idx * 900,
          path: filePath,
          entityType: 'Engin',
          entityId: engin.id,
          enginId: engin.id,
          docNumber: d.number,
          docDate: d.date,
          expiresAt: d.expiresAt ?? null,
          amount: d.amount ?? null,
          uploadedByName: ADMIN_NAME,
          createdAt: d.date,
        },
      });
      stats.documents++;
    }

    await refreshEnginStatus(engin.id);
  }

  const year = new Date().getFullYear();
  for (const [prefix, value] of [['ENG', FLEET.filter((f) => f.kind === 'engin').length], ['MAT', FLEET.filter((f) => f.kind === 'materiel').length]] as const) {
    const existing = await prisma.counter.findUnique({ where: { prefix_year: { prefix, year } } });
    if (!existing) await prisma.counter.create({ data: { id: `${prefix}-${year}`, prefix, year, value } });
    else if (existing.value < value) await prisma.counter.update({ where: { id: existing.id }, data: { value } });
  }

  return stats;
}

// ─── Chantiers : tranches, sous-traitants, galerie ──────────────────

const SUBCONTRACTORS = [
  { companyName: 'Géo Terrassement SARL', corpsEtat: 'Terrassement', amount: 650_000, ice: '001845120000032', email: 'contact@geo-terrassement.ma', city: 'Casablanca' },
  { companyName: 'Étanchéité Atlas', corpsEtat: 'Étanchéité', amount: 380_000, ice: '001845120000045', email: 'devis@etancheite-atlas.ma', city: 'Rabat' },
  { companyName: 'Alu Concept Maroc', corpsEtat: 'Menuiserie', amount: 540_000, ice: '001845120000078', email: 'commercial@alu-concept.ma', city: 'Casablanca' },
  { companyName: 'ElecNord Services', corpsEtat: 'Électricité', amount: 460_000, ice: '001845120000091', email: 'info@elecnord.ma', city: 'Tanger' },
  { companyName: 'Hydro Sanitaire', corpsEtat: 'Plomberie', amount: 320_000, ice: '001845120000104', email: 'contact@hydro-sanitaire.ma', city: 'Fès' },
  { companyName: 'Staff Déco', corpsEtat: 'Faux plafonds', amount: 210_000, ice: '001845120000117', email: 'atelier@staff-deco.ma', city: 'Marrakech' },
  { companyName: 'Peinture Moderne', corpsEtat: 'Peinture', amount: 180_000, ice: '001845120000120', email: 'chantier@peinture-moderne.ma', city: 'Agadir' },
  { companyName: 'VRD Atlas Travaux', corpsEtat: 'VRD', amount: 720_000, ice: '001845120000133', email: 'travaux@vrd-atlas.ma', city: 'Casablanca' },
  { companyName: 'Isolation Thermique Plus', corpsEtat: 'Isolation', amount: 195_000, ice: '001845120000146', email: 'contact@iso-plus.ma', city: 'Rabat' },
];

const TRANCHE_REMARKS = ['Bloc A — 24 logements', 'Bloc B — 18 logements + commerces', 'Villas jumelées — 12 unités'];
const GALLERY_CAPTIONS = ['Vue d’ensemble du chantier', 'Coulage de dalle', 'Façade en cours', 'Base vie et stockage'];

export async function seedChantierExtras(ctx: SeedContext) {
  const { prisma, chantiers, uploadDir } = ctx;
  let subs = 0;
  let images = 0;
  for (let c = 0; c < chantiers.length; c++) {
    const ch = chantiers[c];
    await prisma.chantierTranche.deleteMany({ where: { chantierId: ch.id, name: { notIn: ch.tranches } } });
    for (let t = 0; t < ch.tranches.length; t++) {
      const data = {
        remark: TRANCHE_REMARKS[t % TRANCHE_REMARKS.length],
        estimatedStartDate: utcDaysAgo(120 - t * 70),
        estimatedEndDate: utcDaysAgo(-(90 + t * 120)),
      };
      await prisma.chantierTranche.upsert({
        where: { chantierId_name: { chantierId: ch.id, name: ch.tranches[t] } },
        update: data,
        create: { chantierId: ch.id, name: ch.tranches[t], ...data },
      });
    }

    const progressRows = await prisma.workProgress.findMany({ where: { chantierId: ch.id } });
    for (let k = 0; k < 5; k++) {
      const s = SUBCONTRACTORS[(c * 3 + k) % SUBCONTRACTORS.length];
      const id = `sub-${ch.id}-${k + 1}`;
      const task = progressRows.find((row) => row.taskName === s.corpsEtat)
        || progressRows.find((row) => row.taskName.toLowerCase().includes(s.corpsEtat.toLowerCase().slice(0, 6)))
        || progressRows[k % Math.max(1, progressRows.length)]
        || null;
      const rawPhases = Array.isArray(task?.phases) ? (task!.phases as Array<{ label?: string; percent?: number }>) : [];
      const workPhases = rawPhases.filter((p) => String(p.label || '').toLowerCase() !== 'validation');
      const scope = k % 2 === 0 && workPhases.length ? 'phase' : 'task';
      const phaseLabel = scope === 'phase' ? String(workPhases[k % workPhases.length]?.label || '') : null;
      const followSource = scope === 'phase' && phaseLabel
        ? workPhases.filter((p) => p.label === phaseLabel)
        : (workPhases.length ? workPhases : [{ label: s.corpsEtat, percent: 50 }]);
      const amount = Math.round(s.amount * (0.75 + c * 0.08 + k * 0.03));
      const status = k === 4 && c % 2 === 0 ? 'termine' : c === 4 && k === 3 ? 'suspendu' : 'actif';
      const paidRatio = status === 'termine' ? 1 : k === 0 ? 0.45 : k === 1 ? 0.22 : k === 2 ? 0.08 : 0;
      const paidAmount = Math.round(amount * paidRatio);
      const progressPct = status === 'termine' ? 100 : Math.min(95, 12 + k * 18 + c * 5);
      const data = {
        chantierId: ch.id,
        companyName: s.companyName,
        corpsEtat: s.corpsEtat,
        phone: `0522${pad(480_000 + c * 100 + k, 6)}`,
        amount,
        paidAmount,
        progressPct,
        status,
        remark: k === 0 ? 'Marché signé — retenue de garantie 10 %' : k === 1 ? 'Avances à valider sur situation' : null,
        workProgressId: task?.id || null,
        scope,
        phaseLabel,
        tranche: task?.tranche || ch.tranches[k % Math.max(1, ch.tranches.length)] || null,
        startDate: utcDaysAgo(90 - k * 12),
        endDate: utcDaysAgo(-(40 + k * 20)),
      };
      await prisma.chantierSubcontractor.upsert({ where: { id }, update: data, create: { id, ...data } });
      await prisma.subcontractFollow.deleteMany({ where: { subcontractorId: id } });
      await prisma.subcontractorPayment.deleteMany({ where: { subcontractorId: id } });
      for (let f = 0; f < followSource.length; f++) {
        const phase = followSource[f];
        const validated = progressPct >= 80 && f === 0;
        await prisma.subcontractFollow.create({
          data: {
            id: `sf-${id}-${f + 1}`,
            subcontractorId: id,
            label: String(phase.label || s.corpsEtat),
            percent: validated ? 100 : Math.max(5, Math.round((phase.percent || progressPct) * (validated ? 1 : 0.6))),
            validated,
            validatedAt: validated ? utcDaysAgo(4 + f) : null,
            sortOrder: f,
          },
        });
      }
      const payCount = paidAmount > 0 ? (paidRatio >= 0.9 ? 3 : paidRatio >= 0.3 ? 2 : 1) : 0;
      let remainingPay = paidAmount;
      const modes = ['especes', 'virement', 'cheque'] as const;
      for (let p = 0; p < payCount; p++) {
        const isLast = p === payCount - 1;
        const part = isLast ? remainingPay : Math.round(paidAmount / payCount);
        remainingPay -= part;
        const kind = p === 0 ? 'avance' : p === 1 ? 'situation' : 'solde';
        const taggedPhase = scope === 'task' ? String(followSource[p % followSource.length]?.label || '') : phaseLabel;
        await prisma.subcontractorPayment.create({
          data: {
            id: `sp-${id}-${p + 1}`,
            subcontractorId: id,
            amount: part,
            kind,
            paymentMode: modes[p % modes.length],
            date: utcDaysAgo(30 - p * 7),
            remark: taggedPhase ? `[phase:${taggedPhase}]` : null,
          },
        });
      }
      subs++;
    }

    const stockItems = [
      { name: 'Ciment CPJ 45', quantity: 120 + c * 15, unit: 'sac', tranche: ch.tranches[0] || null },
      { name: 'Acier HA 12', quantity: 8 + c, unit: 'tonne', tranche: ch.tranches[0] || null },
      { name: 'Parpaing 20', quantity: 2400 + c * 200, unit: 'u', tranche: ch.tranches[1] || ch.tranches[0] || null },
    ];
    for (let si = 0; si < stockItems.length; si++) {
      const row = stockItems[si];
      const sid = `stk-${ch.id}-${si + 1}`;
      await prisma.chantierStockItem.upsert({
        where: { id: sid },
        update: row,
        create: { id: sid, chantierId: ch.id, ...row },
      });
    }

    let cover: string | null = null;
    for (let k = 0; k < GALLERY_CAPTIONS.length; k++) {
      const id = `img-${ch.id}-${k + 1}`;
      const imgPath = writeSceneSvg(uploadDir, `demo-chantier-${ch.id}-${k + 1}.svg`, ch.name, GALLERY_CAPTIONS[k], 195 + c * 12 + k * 6, c + k);
      if (k === 0) cover = imgPath;
      await prisma.chantierImage.upsert({
        where: { id },
        update: { path: imgPath, caption: GALLERY_CAPTIONS[k], sortOrder: k },
        create: { id, chantierId: ch.id, path: imgPath, caption: GALLERY_CAPTIONS[k], sortOrder: k },
      });
      images++;
    }
    const current = await prisma.chantier.findUnique({ where: { id: ch.id }, select: { photo: true } });
    if (!current?.photo && cover) await prisma.chantier.update({ where: { id: ch.id }, data: { photo: cover } });
  }

  for (let p = 0; p < ctx.projects.length; p++) {
    const proj = ctx.projects[p];
    const captions = ['Perspective façade principale', 'Plan de masse', 'Espaces verts et accès'];
    for (let k = 0; k < captions.length; k++) {
      const id = `pimg-${proj.id}-${k + 1}`;
      const imgPath = writeSceneSvg(uploadDir, `demo-projet-${proj.id}-${k + 1}.svg`, proj.name, `${captions[k]} — ${proj.city}`, 25 + p * 30 + k * 8, p + k + 1);
      await prisma.projectImage.upsert({
        where: { id },
        update: { path: imgPath, caption: captions[k], sortOrder: k },
        create: { id, projectId: proj.id, path: imgPath, caption: captions[k], sortOrder: k },
      });
      images++;
    }
  }
  let entreprises = 0;
  for (let i = 0; i < SUBCONTRACTORS.length; i++) {
    const s = SUBCONTRACTORS[i];
    const id = `ent-demo-${i + 1}`;
    const reference = `ENT-2026-${pad(i + 1)}`;
    const payload = {
      companyName: s.companyName,
      phone: `0522${pad(200_000 + i * 111, 6)}`,
      email: s.email,
      address: `${s.city} — Zone industrielle`,
      ice: s.ice,
      remark: `Corps d’état : ${s.corpsEtat}`,
      isActive: i !== 8,
    };
    const existing = await prisma.entreprise.findFirst({
      where: { OR: [{ id }, { reference }, { companyName: s.companyName }] },
    });
    if (existing) {
      await prisma.entreprise.update({
        where: { id: existing.id },
        data: { ...payload, reference: existing.reference || reference },
      });
    } else {
      await prisma.entreprise.create({ data: { id, reference, ...payload } });
    }
    entreprises++;
  }
  const bureauRef = 'ENT-2026-000010';
  const bureau = await prisma.entreprise.findFirst({
    where: { OR: [{ id: 'ent-demo-bureau' }, { reference: bureauRef }, { companyName: 'Bureau d’études Atlas Ingénierie' }] },
  });
  const bureauData = {
    companyName: 'Bureau d’études Atlas Ingénierie',
    phone: '0537720010',
    email: 'contact@atlas-ing.ma',
    address: 'Technopark — Casablanca',
    ice: '001845120000159',
    remark: 'BET structure / VRD — pas encore de marché chantier',
  };
  if (bureau) {
    await prisma.entreprise.update({ where: { id: bureau.id }, data: bureauData });
  } else {
    await prisma.entreprise.create({ data: { id: 'ent-demo-bureau', reference: bureauRef, ...bureauData } });
  }
  entreprises++;
  return { subcontractors: subs, images, entreprises };
}

// ─── Échéanciers ventes / locations ─────────────────────────────────

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function addMonthsUtc(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, Math.min(d.getUTCDate(), 28)));
}

export async function seedPaymentSchedules(ctx: SeedContext) {
  const { prisma } = ctx;
  let saleItems = 0;
  let rentalItems = 0;

  const sales = await prisma.sale.findMany({ where: { reference: { startsWith: 'VTE-2026-' } } });
  for (const sale of sales) {
    await prisma.paymentSchedule.deleteMany({ where: { saleId: sale.id } });
    const start = sale.contractDate ? new Date(Date.UTC(sale.contractDate.getUTCFullYear(), sale.contractDate.getUTCMonth(), sale.contractDate.getUTCDate())) : utcDaysAgo(60);
    const items: Array<{ label: string; amount: number; dueDate: Date }> = [{ label: 'Avance à la signature', amount: sale.advance, dueDate: start }];
    const rest = round2(sale.netPrice - sale.advance);
    const count = 8;
    const per = round2(rest / count);
    for (let k = 1; k <= count; k++) {
      items.push({ label: `Échéance ${k}/${count}`, amount: k === count ? round2(rest - per * (count - 1)) : per, dueDate: addMonthsUtc(start, k) });
    }
    let covered = 0;
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const paid = sale.status === 'soldée' || covered + it.amount <= sale.totalPaid + 1;
      if (paid) covered += it.amount;
      await prisma.paymentSchedule.create({
        data: {
          id: `sch-${sale.reference}-${k}`,
          saleId: sale.id,
          dueDate: it.dueDate,
          amount: it.amount,
          label: it.label,
          status: paid ? 'paid' : 'pending',
          paidAt: paid ? minDate(it.dueDate, today()) : null,
          remark: !paid && it.dueDate < today() ? 'Échéance dépassée — relance client' : null,
        },
      });
      saleItems++;
    }
  }

  const rentals = await prisma.rental.findMany({ where: { reference: { startsWith: 'LOC-2026-' } } });
  for (const rental of rentals) {
    await prisma.paymentSchedule.deleteMany({ where: { rentalId: rental.id } });
    const base = rental.startDate || rental.contractDate || utcDaysAgo(120);
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    const rent = round2(rental.monthlyRent - (rental.discount || 0));
    const now = today();
    const months = Math.max(1, (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + now.getUTCMonth() - start.getUTCMonth() + 1);
    const paidMonths = Math.min(months, Math.round(rental.totalPaid / Math.max(1, rent)));
    let remaining = 0;
    for (let k = 0; k < months; k++) {
      const due = addMonthsUtc(start, k);
      const paid = k < paidMonths;
      if (!paid) remaining += rent;
      await prisma.paymentSchedule.create({
        data: {
          id: `sch-${rental.reference}-${k}`,
          rentalId: rental.id,
          dueDate: due,
          amount: rent,
          label: `Loyer ${MONTHS_FR[due.getUTCMonth()]} ${due.getUTCFullYear()}`,
          status: paid ? 'paid' : 'pending',
          paidAt: paid ? due : null,
        },
      });
      rentalItems++;
    }
    await prisma.rental.update({
      where: { id: rental.id },
      data: { startDate: rental.startDate ?? start, remaining: round2(remaining) },
    });
  }
  return { saleItems, rentalItems };
}

// ─── Historique des échanges, paramètres société, fichiers démo ─────

export async function seedCommunications(ctx: SeedContext) {
  const { prisma, clientIds, supplierIds, adminId } = ctx;
  const templates: Array<{ channel: 'email' | 'sms' | 'whatsapp'; subject?: string; body: string; direction?: 'inbound' | 'outbound' }> = [
    { channel: 'email', subject: 'Rappel d’échéance', body: 'Bonjour, nous vous rappelons que votre prochaine échéance arrive à terme en fin de mois. Cordialement, service commercial GIC.' },
    { channel: 'sms', body: 'GIC : votre rendez-vous de visite est confirmé demain à 10h30. Merci de vous présenter à l’accueil du chantier.' },
    { channel: 'whatsapp', body: 'Bonjour, voici les photos de l’avancement de votre appartement. N’hésitez pas si vous avez des questions.' },
    { channel: 'email', subject: 'Reçu de paiement', body: 'Veuillez trouver ci-joint le reçu de votre dernier versement. Merci pour votre confiance.' },
    { channel: 'whatsapp', direction: 'inbound', body: 'Merci, bien reçu. Est-ce possible de décaler la visite à samedi ?' },
  ];
  let n = 0;
  for (let i = 0; i < Math.min(14, clientIds.length); i++) {
    for (let k = 0; k < 2 + (i % 2); k++) {
      const t = templates[(i + k) % templates.length];
      const id = `conv-cli-${i + 1}-${k + 1}`;
      const data = {
        entityType: 'Client',
        entityId: clientIds[i],
        channel: t.channel,
        direction: t.direction || 'outbound',
        subject: t.subject || null,
        body: t.body,
        recipient: t.channel === 'email' ? `client${i + 1}@email.ma` : `06${pad(30000000 + (i + 1) * 54321, 8)}`.slice(0, 10),
        status: 'sent',
        userId: adminId,
        userName: ADMIN_NAME,
        createdAt: utcDaysAgo(2 + i + k * 5),
      };
      await prisma.conversationMessage.upsert({ where: { id }, update: data, create: { id, ...data } });
      n++;
    }
  }
  for (let s = 0; s < Math.min(4, supplierIds.length); s++) {
    const id = `conv-frn-${s + 1}`;
    const data = {
      entityType: 'Supplier',
      entityId: supplierIds[s],
      channel: 'email',
      direction: 'outbound',
      subject: 'Demande de devis',
      body: 'Bonjour, merci de nous transmettre votre meilleure offre pour la prochaine commande (quantités en pièce jointe). Délai souhaité : 7 jours.',
      status: 'sent',
      userId: adminId,
      userName: ADMIN_NAME,
      createdAt: utcDaysAgo(4 + s * 3),
    };
    await prisma.conversationMessage.upsert({ where: { id }, update: data, create: { id, ...data } });
    n++;
  }
  return n;
}

export async function seedCompanySettings(ctx: SeedContext) {
  const { prisma } = ctx;
  const defaults = {
    address: '45, boulevard Zerktouni — 3e étage',
    city: 'Casablanca',
    phone: '0522 48 12 60',
    email: 'contact@gic.ma',
    ice: '002345678000091',
    rc: 'RC Casablanca 512347',
    printFooterText: 'GIC — Gestion Immobilière & Chantier · contact@gic.ma · 0522 48 12 60',
  };
  const existing = await prisma.companySettings.findUnique({ where: { id: 'default' } });
  if (!existing) {
    await prisma.companySettings.create({ data: { id: 'default', ...defaults } });
    return;
  }
  const patch = Object.fromEntries(
    Object.entries(defaults).filter(([k]) => !existing[k as keyof typeof existing]),
  );
  if (Object.keys(patch).length) await prisma.companySettings.update({ where: { id: 'default' }, data: patch });
}

/** Les documents « démo » du seed historique pointent vers des PDF : on les crée pour que l'aperçu fonctionne. */
export async function ensureDemoDocumentFiles(ctx: SeedContext) {
  const docs = await ctx.prisma.document.findMany({
    where: { path: { startsWith: '/uploads/demo-doc-' } },
    select: { name: true, path: true, category: true },
  });
  for (const d of docs) {
    writeDemoPdf(ctx.uploadDir, path.basename(d.path), d.name, [`Catégorie : ${d.category || '—'}`, 'Document de démonstration']);
  }
  return docs.length;
}
