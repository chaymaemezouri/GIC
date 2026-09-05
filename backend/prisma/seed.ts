import 'dotenv/config';
import bcrypt from 'bcryptjs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { ensureAvatarFiles, avatarUrl, ensureProjectPlanFiles, projectPlanUrl } from '../src/lib/avatars.js';
import {
  syncEncaissementMovement,
  syncPurchaseMovement,
  syncStaffSalaryMovement,
  syncWorkforcePayrollMovement,
  syncMaintenanceMovement,
  syncFuelMovement,
} from '../src/lib/cashSync.js';
import { baseSalaryForPeriod, currentWeekOfMonth } from '../src/lib/staffSalaryPeriod.js';

const prisma = new PrismaClient();

const pad = (n: number, len = 6) => String(n).padStart(len, '0');

const FIRST_NAMES = [
  'Karim', 'Sara', 'Youssef', 'Fatima', 'Mehdi', 'Nadia', 'Omar', 'Laila', 'Hassan', 'Amina',
  'Rachid', 'Khadija', 'Amine', 'Salma', 'Khalid', 'Imane', 'Tarik', 'Houda', 'Adil', 'Meriem',
  'Samir', 'Zineb', 'Bilal', 'Noura', 'Hamza', 'Siham', 'Mustapha', 'Rajae', 'Anas', 'Soukaina',
  'Reda', 'Ghita', 'Ibrahim', 'Wafa', 'Mohamed', 'Asmae', 'Jaouad', 'Hafsa', 'Saad', 'Dounia',
];

const LAST_NAMES = [
  'Alaoui', 'Benali', 'El Amrani', 'Fassi', 'Tazi', 'Bennani', 'Chraibi', 'Idrissi', 'Lahlou', 'Mouline',
  'Ouazzani', 'Rahmani', 'Saadi', 'Tahiri', 'Ziani', 'Amrani', 'Berrada', 'Cherkaoui', 'Daoudi', 'Filali',
  'Guerrouj', 'Hajji', 'Jabri', 'Kettani', 'Lamrani', 'Mansouri', 'Naciri', 'Qadiri', 'Sefrioui', 'Toumi',
];

const CITIES = ['Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Fès', 'Agadir', 'Meknès', 'Oujda'];

const MAROC_BANKS = [
  'Attijariwafa Bank',
  'Banque Populaire',
  'Bank of Africa (BOA)',
  'CIH Bank',
  'Crédit Agricole du Maroc',
  'Crédit du Maroc',
  'BMCI',
  'Al Barid Bank',
  'Saham Bank',
  'CFG Bank',
] as const;

const PROJECTS = [
  { id: 'demo-project', name: 'Résidence Atlas', city: 'Casablanca', desc: 'Programme haut standing — Maarif & Sidi Maarouf' },
  { id: 'proj-rabat', name: 'Les Jardins de Rabat', city: 'Rabat', desc: 'Villas et appartements — Hay Riad' },
  { id: 'proj-tanger', name: 'Marina View', city: 'Tanger', desc: 'Front de mer — Malabata' },
  { id: 'proj-marrakech', name: 'Oasis Marrakech', city: 'Marrakech', desc: 'Résidence golf — Palmeraie' },
  { id: 'proj-fes', name: 'Horizon Fès', city: 'Fès', desc: 'Lotissement premium — Route Immouzer' },
  { id: 'proj-agadir', name: 'Baie d\'Agadir', city: 'Agadir', desc: 'Appartements vue mer — Founty' },
];

const PROPERTY_STATUSES = ['disponible', 'disponible', 'disponible', 'réservé', 'vendu', 'loué', 'indisponible'] as const;

const WORKER_CATEGORIES = ['Maçon', 'Manœuvre', 'Chef d\'équipe', 'Électricien', 'Plombier', 'Coffreur', 'Peintre', 'Ferrailleur'];
const CHAUFFEUR_CATEGORY = 'Chauffeur';

const SUPPLIERS = [
  { ref: 'FRN-2026-000001', name: 'Béton Atlas SARL', contact: 'Omar Fassi', email: 'contact@beton-atlas.ma', portal: true },
  { ref: 'FRN-2026-000002', name: 'Fer & Acier Maroc', contact: 'Hassan Berrada', email: 'contact@fer-acier.ma', portal: false },
  { ref: 'FRN-2026-000003', name: 'Electro Pro SARL', contact: 'Nadia Cherkaoui', email: 'info@electropro.ma', portal: false },
  { ref: 'FRN-2026-000004', name: 'Menuiserie Al Amal', contact: 'Youssef Tazi', email: 'ventes@menuiserie-amal.ma', portal: false },
  { ref: 'FRN-2026-000005', name: 'Plomberie Express', contact: 'Karim Saadi', email: 'devis@plomberie-express.ma', portal: false },
  { ref: 'FRN-2026-000006', name: 'Carrelage Premium', contact: 'Salma Filali', email: 'commercial@carrelage-premium.ma', portal: true },
  { ref: 'FRN-2026-000007', name: 'Location Engins Maroc', contact: 'Mehdi Ouazzani', email: 'loc@engins-maroc.ma', portal: false },
  { ref: 'FRN-2026-000008', name: 'Peintures Du Nord', contact: 'Laila Rahmani', email: 'contact@peintures-nord.ma', portal: false },
];

const ENGINS = [
  { mat: '12345-A-6', brand: 'Caterpillar', genre: 'Pelle hydraulique', status: 'disponible', fuel: 75 },
  { mat: '67890-B-1', brand: 'Volvo', genre: 'Chargeuse', status: 'en_mission', fuel: 45 },
  { mat: '11223-C-8', brand: 'Mercedes', genre: 'Camion benne', status: 'disponible', fuel: 60 },
  { mat: '44556-D-2', brand: 'JCB', genre: 'Mini-pelle', status: 'en_maintenance', fuel: 20 },
  { mat: '77889-E-5', brand: 'Komatsu', genre: 'Bulldozer', status: 'disponible', fuel: 80 },
  { mat: '33445-F-3', brand: 'Manitou', genre: 'Nacelle', status: 'en_mission', fuel: 55 },
];

const CHANTIERS = [
  { id: 'demo-chantier', name: 'Chantier Atlas Bloc A', city: 'Casablanca', progress: 35, workers: 12, manager: 'Hassan Tazi', budget: 3200000 },
  { id: 'chant-rabat', name: 'Résidence Al Bahia', city: 'Tanger', progress: 74, workers: 87, manager: 'Mohamed El Amrani', budget: 4800000 },
  { id: 'chant-tanger', name: 'Marina View — Gros œuvre', city: 'Tanger', progress: 48, workers: 22, manager: 'Omar Fassi', budget: 5500000 },
  { id: 'chant-marrakech', name: 'Oasis Marrakech Phase 1', city: 'Marrakech', progress: 78, workers: 15, manager: 'Nadia Cherkaoui', budget: 4100000 },
  { id: 'chant-fes', name: 'Horizon Fès — VRD', city: 'Fès', progress: 15, workers: 8, manager: 'Youssef Alaoui', budget: 1800000 },
];

const TASKS = [
  'Terrassement', 'Fondations', 'Gros œuvre', 'Coffrage', 'Ferraillage', 'Coulage béton',
  'Électricité', 'Plomberie', 'Menuiserie', 'Carrelage', 'Peinture', 'Faux plafonds',
  'Étanchéité', 'Isolation', 'Revêtement sol', 'Clôture', 'VRD', 'Aménagement paysager', 'Nettoyage fin',
];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function randomItem<T>(arr: readonly T[] | T[], i: number): T {
  return arr[i % arr.length];
}

function computeWorkerNet(
  dailySalary: number,
  pointages: Array<{ totalDay: number; advance: number; bonus: number; dayRate?: number | null }>,
) {
  const brut = pointages.reduce((s, p) => s + p.totalDay * (p.dayRate ?? dailySalary), 0);
  const advances = pointages.reduce((s, p) => s + p.advance, 0);
  const bonuses = pointages.reduce((s, p) => s + p.bonus, 0);
  return { brut, advances, bonuses, netDue: brut + bonuses - advances };
}

async function seedWorkforcePayrollBatch(
  workers: Array<{ id: string; dailySalary: number }>,
  opts: {
    periodYear: number;
    periodMonth: number;
    pointageFrom: Date;
    pointageTo: Date;
    refPrefix: string;
    paidPattern: (index: number, netDue: number) => { amountPaid: number; status: string } | null;
  },
) {
  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    const pointages = await prisma.pointage.findMany({
      where: {
        workforceId: w.id,
        validated: true,
        date: { gte: opts.pointageFrom, lte: opts.pointageTo },
      },
    });
    if (!pointages.length) continue;

    const computed = computeWorkerNet(w.dailySalary, pointages);
    if (computed.netDue <= 0) continue;

    const pay = opts.paidPattern(i, computed.netDue);
    if (!pay) continue;

    const { amountPaid, status } = pay;
    const remaining = Math.max(0, computed.netDue - amountPaid);
    const ref = `${opts.refPrefix}-${opts.periodYear}${pad(opts.periodMonth, 2)}-${pad(i + 1, 4)}`;

    const record = await prisma.workforcePayrollRecord.upsert({
      where: {
        workforceId_periodYear_periodMonth: { workforceId: w.id, periodYear: opts.periodYear, periodMonth: opts.periodMonth },
      },
      update: {
        reference: ref,
        brut: computed.brut,
        advances: computed.advances,
        bonuses: computed.bonuses,
        netDue: computed.netDue,
        amountPaid,
        remaining,
        paymentMode: i % 2 === 0 ? 'especes' : 'virement',
        status,
        paidAt: amountPaid > 0 ? daysAgo(i % 8) : null,
      },
      create: {
        reference: ref,
        workforceId: w.id,
        periodYear: opts.periodYear,
        periodMonth: opts.periodMonth,
        brut: computed.brut,
        advances: computed.advances,
        bonuses: computed.bonuses,
        netDue: computed.netDue,
        amountPaid,
        remaining,
        paymentMode: i % 2 === 0 ? 'especes' : 'virement',
        status,
        paidAt: amountPaid > 0 ? daysAgo(i % 8) : null,
        remark: status === 'paid' ? 'Paie soldée' : status === 'partial' ? 'Acompte sur salaire' : undefined,
      },
      include: { workforce: { select: { firstName: true, lastName: true, reference: true } } },
    });

    await syncWorkforcePayrollMovement(record);
  }
}

async function seedFinanceLedger() {
  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;
  const pointageFrom = daysAgo(25);
  pointageFrom.setHours(0, 0, 0, 0);
  const pointageTo = new Date();
  pointageTo.setHours(23, 59, 59, 999);

  // Supprimer les anciens mouvements manuels (legacy seed)
  await prisma.cashMovement.deleteMany({
    where: { OR: [{ id: { startsWith: 'mv-' } }, { isAutomatic: false, sourceType: null }] },
  });

  // Encaissements ventes/locations → crédit caisse
  const payments = await prisma.payment.findMany({
    include: {
      sale: { select: { reference: true } },
      rental: { select: { reference: true } },
    },
    orderBy: { date: 'desc' },
  });
  for (const p of payments) {
    await syncEncaissementMovement(p);
  }

  // Achats contrôlés → débit caisse
  const purchases = await prisma.purchase.findMany({
    where: { status: 'contrôlé' },
    include: { supplier: { select: { companyName: true } } },
  });
  for (const a of purchases) {
    await syncPurchaseMovement(a);
  }

  // Main-d'œuvre — bulletins de paie variés (payé / partiel / en attente), hors chauffeurs
  const workers = await prisma.workforce.findMany({
    where: { isActive: true, NOT: { category: CHAUFFEUR_CATEGORY } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 20,
  });

  const prevMonth = periodMonth === 1 ? 12 : periodMonth - 1;
  const prevYear = periodMonth === 1 ? periodYear - 1 : periodYear;

  await seedWorkforcePayrollBatch(workers, {
    periodYear,
    periodMonth,
    pointageFrom,
    pointageTo,
    refPrefix: 'MO',
    paidPattern: (i, netDue) => {
      if (i < 5) return { amountPaid: netDue, status: 'paid' };
      if (i < 10) return { amountPaid: Math.round(netDue * 0.6), status: 'partial' };
      if (i < 14) return { amountPaid: Math.round(netDue * 0.35), status: 'partial' };
      return null;
    },
  });

  // Chauffeurs — bulletins de paie (pointage validé → salaires → décaissements caisse)
  const chauffeurs = await prisma.workforce.findMany({
    where: { isActive: true, category: CHAUFFEUR_CATEGORY },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  await seedWorkforcePayrollBatch(chauffeurs, {
    periodYear,
    periodMonth,
    pointageFrom,
    pointageTo,
    refPrefix: 'CH',
    paidPattern: (i, netDue) => {
      if (i < 2) return { amountPaid: netDue, status: 'paid' };
      if (i < 4) return { amountPaid: Math.round(netDue * 0.5), status: 'partial' };
      return null; // 2 chauffeurs en attente (visible dans salaires + décaissements pending)
    },
  });

  // Main-d'œuvre — mois précédent (historique soldé)
  const prevMonthStart = new Date(prevYear, prevMonth - 1, 1);
  const prevMonthEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59, 999);
  for (let i = 0; i < Math.min(8, workers.length); i++) {
    const w = workers[i];
    const pointages = await prisma.pointage.findMany({
      where: {
        workforceId: w.id,
        validated: true,
        date: { gte: prevMonthStart, lte: prevMonthEnd },
      },
    });
    const estimatedDays = pointages.length ? pointages.reduce((s, p) => s + p.totalDay, 0) : 18 + (i % 4);
    const brut = pointages.length
      ? pointages.reduce((s, p) => s + p.totalDay * (p.dayRate ?? w.dailySalary), 0)
      : w.dailySalary * estimatedDays;
    const advances = pointages.length ? pointages.reduce((s, p) => s + p.advance, 0) : 200 + i * 50;
    const bonuses = pointages.length ? pointages.reduce((s, p) => s + p.bonus, 0) : i % 2 === 0 ? 100 : 0;
    const netDue = brut + bonuses - advances;
    if (netDue <= 0) continue;

    const record = await prisma.workforcePayrollRecord.upsert({
      where: {
        workforceId_periodYear_periodMonth: { workforceId: w.id, periodYear: prevYear, periodMonth: prevMonth },
      },
      update: {
        reference: `MO-${prevYear}${pad(prevMonth, 2)}-${pad(i + 1, 4)}`,
        brut,
        advances,
        bonuses,
        netDue,
        amountPaid: netDue,
        remaining: 0,
        paymentMode: 'virement',
        status: 'paid',
        paidAt: daysAgo(25 + i),
      },
      create: {
        reference: `MO-${prevYear}${pad(prevMonth, 2)}-${pad(i + 1, 4)}`,
        workforceId: w.id,
        periodYear: prevYear,
        periodMonth: prevMonth,
        brut,
        advances,
        bonuses,
        netDue,
        amountPaid: netDue,
        remaining: 0,
        paymentMode: 'virement',
        status: 'paid',
        paidAt: daysAgo(25 + i),
        remark: `Paie ${prevMonth}/${prevYear} soldée`,
      },
      include: { workforce: { select: { firstName: true, lastName: true, reference: true } } },
    });
    await syncWorkforcePayrollMovement(record);
  }

  // Équipe interne payée → débit caisse
  const staffSalaries = await prisma.internalStaffSalaryRecord.findMany({
    where: { status: 'payé' },
    include: { staff: { select: { firstName: true, lastName: true } } },
  });
  for (const r of staffSalaries) {
    await syncStaffSalaryMovement(r);
  }

  const maintenances = await prisma.maintenance.findMany({
    where: { budget: { gt: 0 } },
    include: { engin: { select: { brand: true, matricule: true } } },
  });
  for (const m of maintenances) {
    await syncMaintenanceMovement(m);
  }

  const fuelLogs = await prisma.fuelLog.findMany({
    where: { cost: { gt: 0 } },
    include: { engin: { select: { brand: true, matricule: true } } },
  });
  for (const f of fuelLogs) {
    await syncFuelMovement(f);
  }

  const [creditAgg, debitAgg, encCount, decCount, achatCtrl, moPaid, chPaid, staffPaid, maintN, fuelN] =
    await Promise.all([
    prisma.cashMovement.aggregate({ _sum: { credit: true }, where: { isAutomatic: true } }),
    prisma.cashMovement.aggregate({ _sum: { debit: true }, where: { isAutomatic: true } }),
    prisma.cashMovement.count({ where: { sourceType: 'encaissement' } }),
    prisma.cashMovement.count({
      where: {
        sourceType: { in: ['achat', 'main_oeuvre', 'equipe_interne', 'maintenance', 'carburant'] },
      },
    }),
    prisma.purchase.count({ where: { status: 'contrôlé' } }),
    prisma.workforcePayrollRecord.count({
      where: { amountPaid: { gt: 0 }, workforce: { NOT: { category: CHAUFFEUR_CATEGORY } } },
    }),
    prisma.workforcePayrollRecord.count({
      where: { amountPaid: { gt: 0 }, workforce: { category: CHAUFFEUR_CATEGORY } },
    }),
    prisma.internalStaffSalaryRecord.count({ where: { status: 'payé' } }),
    prisma.maintenance.count(),
    prisma.fuelLog.count(),
  ]);

  const credit = creditAgg._sum.credit || 0;
  const debit = debitAgg._sum.debit || 0;
  console.log(`Caisse auto       : ${encCount} encaissements, ${decCount} décaissements`);
  console.log(`Décaissements demo: achats ${achatCtrl}, MO ${moPaid}, chauffeurs ${chPaid}, équipe ${staffPaid}, maintenance ${maintN}, carburant ${fuelN}`);
  console.log(`Solde caisse      : ${(credit - debit).toLocaleString('fr-MA')} MAD (crédit ${credit.toLocaleString('fr-MA')} − débit ${debit.toLocaleString('fr-MA')})`);
}

async function main() {
  const passwordHash = await bcrypt.hash('Admin@2026', 10);
  const supplierPwd = await bcrypt.hash('Fournisseur@2026', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@gic.ma' },
    update: { lastLoginAt: daysAgo(0) },
    create: {
      email: 'admin@gic.ma',
      username: 'admin',
      passwordHash,
      firstName: 'Super',
      lastName: 'Administrateur',
      role: 'SUPER_ADMIN',
      lastLoginAt: daysAgo(0),
    },
  });

  for (const u of [
    { email: 'comptable@gic.ma', pwd: 'Comptable@2026', role: 'COMPTABLE', firstName: 'Fatima', lastName: 'El Amrani' },
    { email: 'commercial@gic.ma', pwd: 'Commercial@2026', role: 'COMMERCIAL', firstName: 'Sara', lastName: 'Bennani' },
    { email: 'chef@gic.ma', pwd: 'Chef@2026', role: 'CHEF_CHANTIER', firstName: 'Karim', lastName: 'Tazi' },
  ]) {
    const hash = await bcrypt.hash(u.pwd, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, firstName: u.firstName, lastName: u.lastName },
      create: {
        email: u.email,
        username: u.email.split('@')[0],
        passwordHash: hash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
      },
    });
  }

  // Équipe interne — fiches RH (compte plateforme optionnel)
  const INTERNAL_STAFF = [
    {
      ref: 'COL-2026-000001',
      firstName: 'Fatima', lastName: 'El Amrani',
      email: 'fatima.elamrani@gic.ma', phone1: '0661123456',
      jobTitle: 'Comptable', department: 'Comptabilité', contractType: 'CDI',
      monthlySalary: 8500, salaryPeriod: 'mensuel', declared: true, cnssNumber: 'CNSS-884521',
      bankName: 'Attijariwafa Bank', rib: '007780000123456789012345',
      linkUserEmail: 'comptable@gic.ma', hireDaysAgo: 820,
    },
    {
      ref: 'COL-2026-000002',
      firstName: 'Sara', lastName: 'Bennani',
      email: 'sara.bennani@gic.ma', phone1: '0662234567',
      jobTitle: 'Commercial', department: 'Commercial', contractType: 'CDI',
      monthlySalary: 7200, salaryPeriod: 'mensuel', declared: true, cnssNumber: 'CNSS-772103',
      bankName: 'Banque Populaire', rib: '011780000234567890123456',
      linkUserEmail: 'commercial@gic.ma', hireDaysAgo: 540,
    },
    {
      ref: 'COL-2026-000003',
      firstName: 'Karim', lastName: 'Tazi',
      email: 'karim.tazi@gic.ma', phone1: '0663345678',
      jobTitle: 'Chef de chantier', department: 'Chantier', contractType: 'CDI',
      monthlySalary: 9800, salaryPeriod: 'bihebdomadaire', declared: true, cnssNumber: 'CNSS-661045',
      bankName: 'Bank of Africa (BOA)', rib: '013780000345678901234567',
      linkUserEmail: 'chef@gic.ma', hireDaysAgo: 1100,
    },
    {
      ref: 'COL-2026-000004',
      firstName: 'Nadia', lastName: 'Cherkaoui',
      email: 'nadia.cherkaoui@gic.ma', phone1: '0664456789',
      jobTitle: 'Secrétaire', department: 'Administration', contractType: 'CDI',
      monthlySalary: 5500, salaryPeriod: 'mensuel', declared: true, cnssNumber: 'CNSS-559812',
      bankName: 'CIH Bank', rib: '230780000456789012345678',
      linkUserEmail: null, hireDaysAgo: 400,
    },
    {
      ref: 'COL-2026-000005',
      firstName: 'Mohamed', lastName: 'Lahlou',
      email: 'm.lahlou@gic.ma', phone1: '0665567890',
      jobTitle: 'Assistant(e) de direction', department: 'Direction', contractType: 'CDI',
      monthlySalary: 6800, salaryPeriod: 'hebdomadaire', declared: false,
      bankName: 'Crédit du Maroc', rib: '021780000567890123456789',
      linkUserEmail: null, hireDaysAgo: 260,
    },
    {
      ref: 'COL-2026-000006',
      firstName: 'Imane', lastName: 'Saadi',
      email: 'imane.saadi@gic.ma', phone1: '0666678901',
      jobTitle: 'Responsable RH', department: 'Ressources humaines', contractType: 'CDI',
      monthlySalary: 9200, salaryPeriod: 'mensuel', declared: true, cnssNumber: 'CNSS-448731',
      bankName: 'BMCI', rib: '007780000678901234567890',
      linkUserEmail: null, hireDaysAgo: 730,
    },
    {
      ref: 'COL-2026-000007',
      firstName: 'Youssef', lastName: 'Filali',
      email: 'y.filali@gic.ma', phone1: '0667789012',
      jobTitle: 'Informaticien', department: 'Informatique', contractType: 'CDD',
      monthlySalary: 7500, salaryPeriod: 'trimestriel', declared: true, cnssNumber: 'CNSS-337654',
      bankName: 'Al Barid Bank', rib: '350780000789012345678901',
      linkUserEmail: null, hireDaysAgo: 120, isActive: false,
      remark: 'CDD terminé — renouvellement en cours',
    },
    {
      ref: 'COL-2026-000008',
      firstName: 'Meriem', lastName: 'Ouazzani',
      email: 'meriem.ouazzani@gic.ma', phone1: '0668890123',
      jobTitle: 'Comptable', department: 'Comptabilité', contractType: 'Stage',
      monthlySalary: 3500, salaryPeriod: 'journalier', declared: false,
      bankName: 'CFG Bank', rib: '050780000890123456789012',
      linkUserEmail: null, hireDaysAgo: 90,
    },
  ] as const;

  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;
  const prevMonth = periodMonth === 1 ? 12 : periodMonth - 1;
  const prevYear = periodMonth === 1 ? periodYear - 1 : periodYear;
  const month2 = prevMonth === 1 ? 11 : prevMonth === 2 ? 12 : prevMonth - 2;
  const year2 = prevMonth <= 2 ? prevYear - 1 : prevYear;

  for (let staffIdx = 0; staffIdx < INTERNAL_STAFF.length; staffIdx++) {
    const s = INTERNAL_STAFF[staffIdx];
    let userId: string | null = null;
    if (s.linkUserEmail) {
      const linked = await prisma.user.findUnique({ where: { email: s.linkUserEmail }, select: { id: true } });
      userId = linked?.id ?? null;
    }

    const staff = await prisma.internalStaff.upsert({
      where: { reference: s.ref },
      update: {
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        phone1: s.phone1,
        jobTitle: s.jobTitle,
        department: s.department,
        contractType: s.contractType,
        monthlySalary: s.monthlySalary,
        salaryPeriod: 'salaryPeriod' in s ? s.salaryPeriod : 'mensuel',
        declared: s.declared,
        cnssNumber: 'cnssNumber' in s ? s.cnssNumber : null,
        bankName: 'bankName' in s ? s.bankName : null,
        rib: 'rib' in s ? s.rib : null,
        bankAccount: 'rib' in s ? s.rib : null,
        hireDate: daysAgo(s.hireDaysAgo),
        isActive: 'isActive' in s ? s.isActive : true,
        remark: 'remark' in s ? s.remark : null,
        userId,
      },
      create: {
        reference: s.ref,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        phone1: s.phone1,
        jobTitle: s.jobTitle,
        department: s.department,
        contractType: s.contractType,
        monthlySalary: s.monthlySalary,
        salaryPeriod: 'salaryPeriod' in s ? s.salaryPeriod : 'mensuel',
        declared: s.declared,
        cnssNumber: 'cnssNumber' in s ? s.cnssNumber : null,
        bankName: 'bankName' in s ? s.bankName : null,
        rib: 'rib' in s ? s.rib : null,
        bankAccount: 'rib' in s ? s.rib : null,
        hireDate: daysAgo(s.hireDaysAgo),
        isActive: 'isActive' in s ? s.isActive : true,
        remark: 'remark' in s ? s.remark : null,
        userId,
      },
    });

    if (s.isActive !== false) {
      const salaryPeriod = 'salaryPeriod' in s ? s.salaryPeriod : 'mensuel';
      const baseForPeriod = baseSalaryForPeriod(s.monthlySalary, salaryPeriod);
      const curBonus = staffIdx % 2 === 0 ? 400 : staffIdx % 3 === 0 ? 250 : 0;
      const curAdvance = staffIdx % 4 === 0 ? 1000 : staffIdx % 4 === 1 ? 600 : staffIdx % 4 === 2 ? 300 : 0;
      const curStatus = staffIdx % 5 === 0 ? 'brouillon' : staffIdx % 5 === 1 ? 'brouillon' : 'payé';

      async function upsertSalary(
        y: number,
        m: number,
        week: number,
        bonus: number,
        advance: number,
        status: string,
        daysAgoPaid: number,
      ) {
        const base = week > 0 ? baseForPeriod : s.monthlySalary;
        const net = base + bonus - advance;
        await prisma.internalStaffSalaryRecord.upsert({
          where: {
            staffId_periodYear_periodMonth_periodWeek: {
              staffId: staff.id,
              periodYear: y,
              periodMonth: m,
              periodWeek: week,
            },
          },
          update: {
            salaryPeriod,
            baseSalary: base,
            bonus,
            advance,
            netSalary: net,
            status,
            paidAt: status === 'payé' ? daysAgo(daysAgoPaid) : null,
          },
          create: {
            staffId: staff.id,
            periodYear: y,
            periodMonth: m,
            periodWeek: week,
            salaryPeriod,
            baseSalary: base,
            bonus,
            deduction: 0,
            advance,
            netSalary: net,
            status,
            paidAt: status === 'payé' ? daysAgo(daysAgoPaid) : null,
          },
        });
      }

      await upsertSalary(periodYear, periodMonth, 0, curBonus, curAdvance, curStatus, 5);
      await upsertSalary(prevYear, prevMonth, 0, 300, staffIdx % 2 === 0 ? 0 : 800, 'payé', 20);
      await upsertSalary(year2, month2, 0, 0, staffIdx % 3 === 0 ? 500 : 0, 'payé', 35);

      if (salaryPeriod === 'hebdomadaire') {
        for (let w = 1; w <= 4; w++) {
          await upsertSalary(
            periodYear,
            periodMonth,
            w,
            w === 4 ? 100 : 0,
            w === 2 ? 200 : 0,
            w <= 3 ? 'payé' : 'brouillon',
            3 + w,
          );
        }
      }
      if (salaryPeriod === 'bihebdomadaire') {
        await upsertSalary(periodYear, periodMonth, 1, 150, 0, 'payé', 8);
        await upsertSalary(periodYear, periodMonth, 2, 0, 300, staffIdx % 2 === 0 ? 'brouillon' : 'payé', 2);
      }
      if (salaryPeriod === 'journalier') {
        const cw = currentWeekOfMonth();
        for (let d = 1; d <= Math.min(5, cw + 1); d++) {
          await upsertSalary(periodYear, periodMonth, d, 0, 0, d <= 3 ? 'payé' : 'brouillon', d);
        }
      }
    }
  }

  const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  ensureAvatarFiles(uploadDir, 45);
  ensureProjectPlanFiles(uploadDir, PROJECTS.map((p) => ({ id: p.id, name: p.name })));

  // Comptes caisse (trésorerie / Balance)
  for (const acc of [
    { id: 'caisse-principale', name: 'Caisse principale', type: 'caisse' },
    { id: 'banque-principale', name: 'Compte Attijariwafa', type: 'banque' },
    { id: 'banque-cdm', name: 'Compte CDM Chantiers', type: 'banque' },
  ]) {
    await prisma.cashAccount.upsert({ where: { id: acc.id }, update: {}, create: acc });
  }

  // Reconnus + caisse bureau
  const reconnusSeed = [
    { id: 'rec-fatima', firstName: 'Fatima', lastName: 'Zahra', phone1: '0611223344', relation: 'Femme de ménage', reference: 'REC-2026-000001' },
    { id: 'rec-hassan', firstName: 'Hassan', lastName: 'El Amrani', phone1: '0622334455', relation: 'Courses bureau', reference: 'REC-2026-000002' },
    { id: 'rec-sara', firstName: 'Sara', lastName: 'Bennani', phone1: '0633445566', relation: 'Assistante', reference: 'REC-2026-000003' },
    { id: 'rec-youssef', firstName: 'Youssef', lastName: 'Kabbaj', phone1: '0644556677', relation: 'Fournisseur ponctuel', reference: 'REC-2026-000004' },
  ];
  for (const r of reconnusSeed) {
    await prisma.reconnu.upsert({
      where: { id: r.id },
      update: { firstName: r.firstName, lastName: r.lastName, phone1: r.phone1, relation: r.relation, reference: r.reference },
      create: { ...r, isActive: true },
    });
  }
  const officeMoves = [
    { id: 'ocm-1', direction: 'entree', amount: 5000, purpose: 'alimentation', designation: 'Alimentation caisse bureau', reconnuId: null as string | null, reconnuName: null as string | null, days: 14 },
    { id: 'ocm-2', direction: 'sortie', amount: 350, purpose: 'travail', designation: 'Nettoyage bureaux', reconnuId: 'rec-fatima', reconnuName: null, days: 10 },
    { id: 'ocm-3', direction: 'sortie', amount: 220, purpose: 'aleatoire', designation: 'Fournitures bureau', reconnuId: 'rec-hassan', reconnuName: null, days: 7 },
    { id: 'ocm-4', direction: 'sortie', amount: 800, purpose: 'chantier', designation: 'Avance courses chantier', reconnuId: 'rec-sara', reconnuName: null, days: 3 },
    { id: 'ocm-5', direction: 'entree', amount: 150, purpose: 'alimentation', designation: 'Rendu monnaies', reconnuId: 'rec-hassan', reconnuName: null, days: 1 },
    { id: 'ocm-6', direction: 'sortie', amount: 180, purpose: 'aleatoire', designation: 'Taxi urgent', reconnuId: null, reconnuName: 'Ahmed Chauffeur (externe)', days: 2 },
    { id: 'ocm-7', direction: 'sortie', amount: 95, purpose: 'travail', designation: 'Courses pharmacie', reconnuId: null, reconnuName: 'Laila Bensaid', days: 0 },
  ];
  for (const m of officeMoves) {
    await prisma.officeCashMovement.upsert({
      where: { id: m.id },
      update: {
        direction: m.direction,
        amount: m.amount,
        purpose: m.purpose,
        designation: m.designation,
        workLabel: m.purpose === 'travail' ? 'Entretien' : null,
        reconnuId: m.reconnuId,
        reconnuName: m.reconnuName,
        date: daysAgo(m.days),
      },
      create: {
        id: m.id,
        direction: m.direction,
        amount: m.amount,
        purpose: m.purpose,
        designation: m.designation,
        workLabel: m.purpose === 'travail' ? 'Entretien' : null,
        reconnuId: m.reconnuId,
        reconnuName: m.reconnuName,
        date: daysAgo(m.days),
        remark: null,
      },
    });
  }

  // Location + projets + hiérarchie
  const location = await prisma.location.upsert({
    where: { id: 'loc-casa' },
    update: {},
    create: { id: 'loc-casa', name: 'Grand Casablanca', city: 'Casablanca', description: 'Zone commerciale GIC' },
  });

  const projectIds: string[] = [];
  for (const p of PROJECTS) {
    const proj = await prisma.project.upsert({
      where: { id: p.id },
      update: { name: p.name, city: p.city, description: p.desc, photo: projectPlanUrl(p.id) },
      create: {
        id: p.id,
        name: p.name,
        city: p.city,
        description: p.desc,
        photo: projectPlanUrl(p.id),
        status: 'actif',
        locationId: p.city === 'Casablanca' ? location.id : undefined,
      },
    });
    projectIds.push(proj.id);

    const tranche = await prisma.tranche.upsert({
      where: { id: `tr-${p.id}` },
      update: {},
      create: { id: `tr-${p.id}`, name: 'Tranche 1', projectId: proj.id },
    });

    for (let b = 1; b <= 2; b++) {
      const bloc = await prisma.bloc.upsert({
        where: { id: `bl-${p.id}-${b}` },
        update: {},
        create: { id: `bl-${p.id}-${b}`, name: `Bloc ${String.fromCharCode(64 + b)}`, trancheId: tranche.id },
      });

      const lot = await prisma.lot.upsert({
        where: { id: `lot-${p.id}-${b}` },
        update: {},
        create: { id: `lot-${p.id}-${b}`, name: `Lot ${b}`, blocId: bloc.id },
      });

      for (let f = 1; f <= 4; f++) {
        await prisma.floor.upsert({
          where: { id: `fl-${p.id}-${b}-${f}` },
          update: {},
          create: { id: `fl-${p.id}-${b}-${f}`, name: f === 1 ? 'RDC' : `Étage ${f - 1}`, lotId: lot.id },
        });
      }
    }
  }

  // Agents
  const agentIds: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const id = i === 1 ? 'demo-agent' : `agent-${i}`;
    const agent = await prisma.agent.upsert({
      where: { id },
      update: {},
      create: {
        id,
        firstName: randomItem(FIRST_NAMES, i + 5),
        lastName: randomItem(LAST_NAMES, i + 3),
        email: `agent${i}@gic.ma`,
        phone1: `06${pad(10000000 + i * 111111, 8)}`.slice(0, 10),
        isActive: true,
      },
    });
    agentIds.push(agent.id);
  }

  // Mandants
  const mandantIds: string[] = [];
  for (let i = 1; i <= 15; i++) {
    const id = `mandant-${i}`;
    const m = await prisma.mandant.upsert({
      where: { id },
      update: {},
      create: {
        id,
        firstName: randomItem(FIRST_NAMES, i + 10),
        lastName: randomItem(LAST_NAMES, i + 8),
        identityType: 'CIN',
        identityNumber: `M${pad(i, 6)}`,
        email: `mandant${i}@email.ma`,
        phone1: `06${pad(20000000 + i * 77777, 8)}`.slice(0, 10),
        address: `${randomItem(CITIES, i)}`,
      },
    });
    mandantIds.push(m.id);
  }

const SOURCES = ['Recommandation', 'Site web', 'Salon immobilier', 'Agent commercial', 'Réseaux sociaux'];

  // Clients (45)
  const clientIds: string[] = [];
  for (let i = 1; i <= 45; i++) {
    const ref = `CLI-2026-${pad(i)}`;
    const isBuyer = i <= 20;
    const isTenant = i > 20 && i <= 28;
    const isProspect = i > 28;
    const birthYear = 1975 + (i % 25);
    const birthDate = new Date(birthYear, (i % 12), 1 + (i % 28));
    const clientData = {
      firstName: randomItem(FIRST_NAMES, i),
      lastName: randomItem(LAST_NAMES, i),
      email: `client${i}@email.ma`,
      phone1: `06${pad(30000000 + i * 54321, 8)}`.slice(0, 10),
      identityType: 'CIN',
      identityNumber: `C${pad(100000 + i, 6)}`,
      address: `${randomItem(CITIES, i)} — Quartier ${i}`,
      birthDate,
      source: randomItem(SOURCES, i),
      photo: avatarUrl(i),
      remark: i % 7 === 0 ? 'Client fidèle — suivi prioritaire' : undefined,
      isProspect,
      isBuyer,
      isTenant,
      agentId: randomItem(agentIds, i),
      isArchived: i >= 43,
      archivedAt: i >= 43 ? daysAgo(5) : null as Date | null,
    };
    const client = await prisma.client.upsert({
      where: { reference: ref },
      update: clientData,
      create: {
        reference: ref,
        ...clientData,
        createdAt: daysAgo(45 - i),
      },
    });
    clientIds.push(client.id);

    // 1 à 2 mandants par client (onglet Mandants)
    await prisma.clientMandant.upsert({
      where: { clientId_mandantId: { clientId: client.id, mandantId: mandantIds[(i - 1) % mandantIds.length] } },
      update: {},
      create: { clientId: client.id, mandantId: mandantIds[(i - 1) % mandantIds.length] },
    });
    await prisma.clientMandant.upsert({
      where: { clientId_mandantId: { clientId: client.id, mandantId: mandantIds[(i + 4) % mandantIds.length] } },
      update: {},
      create: { clientId: client.id, mandantId: mandantIds[(i + 4) % mandantIds.length] },
    });
  }

  // Biens (~90 : 15 par projet)
  const propertyIds: { id: string; status: string; price: number; projectId: string }[] = [];
  let bienNum = 0;
  for (const proj of PROJECTS) {
    for (let i = 1; i <= 15; i++) {
      bienNum++;
      const ref = `BIEN-2026-${pad(bienNum)}`;
      const status = randomItem(PROPERTY_STATUSES, bienNum);
      const surface = 55 + (bienNum % 8) * 12;
      const price = Math.round((800000 + bienNum * 45000) / 1000) * 1000;
      const floorId = `fl-${proj.id}-${(i % 2) + 1}-${(i % 4) + 1}`;

      const prop = await prisma.property.upsert({
        where: { reference: ref },
        update: { status, price },
        create: {
          reference: ref,
          name: `Appartement ${String.fromCharCode(65 + (i % 6))}${i} — ${proj.name.split(' ')[0]}`,
          city: proj.city,
          surface,
          rooms: 2 + (i % 4),
          status,
          price,
          projectId: proj.id,
          floorId,
          description: `${surface} m² — ${2 + (i % 4)} chambres`,
        },
      });
      propertyIds.push({ id: prop.id, status, price, projectId: proj.id });
    }
  }

  // Ventes — une vente par acheteur + ventes prospects (onglet Ventes / Biens / Paiements)
  const saleStatuses = ['signée', 'en_cours', 'en_cours_paiement', 'soldée', 'en_cours_paiement'];
  let saleNum = 0;
  let propIdx = 0;

  async function seedSale(clientIndex: number, extra = false) {
    saleNum++;
    const ref = `VTE-2026-${pad(saleNum)}`;
    const prop = propertyIds[propIdx++];
    if (!prop) return;
    const clientId = clientIds[clientIndex];
    const salePrice = prop.price;
    const advance = Math.round(salePrice * 0.2);
    const totalPaid = Math.round(salePrice * (0.25 + (saleNum % 5) * 0.12));
    const remaining = Math.max(0, salePrice - totalPaid);
    const status = randomItem(saleStatuses, saleNum);

    const sale = await prisma.sale.upsert({
      where: { reference: ref },
      update: { clientId, propertyId: prop.id, totalPaid, remaining, status },
      create: {
        reference: ref,
        clientId,
        propertyId: prop.id,
        contractDate: daysAgo(90 - saleNum * 2),
        salePrice,
        advance,
        netPrice: salePrice,
        totalPaid,
        remaining,
        status,
        contractType: extra ? 'Vente directe' : 'VEFA',
        description: `Vente appartement — ${ref}`,
        createdAt: daysAgo(90 - saleNum * 2),
      },
    });

    await prisma.property.update({
      where: { id: prop.id },
      data: { status: status === 'soldée' ? 'vendu' : 'réservé' },
    });

    for (let p = 1; p <= 4; p++) {
      const receipt = `REC-VTE-${pad(saleNum)}-${p}`;
      await prisma.payment.upsert({
        where: { receiptNo: receipt },
        update: { saleId: sale.id },
        create: {
          receiptNo: receipt,
          saleId: sale.id,
          date: daysAgo(80 - saleNum * 2 - p * 4),
          amount: Math.round(totalPaid / (5 - p + 1)) || advance,
          nature: p === 1 ? 'Avance' : p === 4 ? 'Solde' : 'Échéance',
          operationType: p % 2 === 0 ? 'virement' : 'cheque',
          payerName: `Client ${clientIndex + 1}`,
        },
      });
    }
  }

  // 20 acheteurs : 1 vente chacun
  for (let c = 0; c < 20; c++) await seedSale(c);
  // 5 premiers clients : 2e vente
  for (let c = 0; c < 5; c++) await seedSale(c, true);
  // 10 prospects convertis : 1 vente
  for (let c = 28; c < 38; c++) await seedSale(c);

  // Locations — locataires + quelques clients mixtes (onglet Locations)
  let rentalNum = 0;
  async function seedRental(clientIndex: number) {
    rentalNum++;
    const ref = `LOC-2026-${pad(rentalNum)}`;
    const prop = propertyIds[propIdx++];
    if (!prop) return;
    const monthlyRent = 4500 + rentalNum * 280;
    const monthsPaid = (rentalNum % 5) + 2;
    const totalPaid = monthlyRent * monthsPaid;

    const rental = await prisma.rental.upsert({
      where: { reference: ref },
      update: { clientId: clientIds[clientIndex], totalPaid },
      create: {
        reference: ref,
        clientId: clientIds[clientIndex],
        propertyId: prop.id,
        contractDate: daysAgo(200 - rentalNum * 8),
        monthlyRent,
        totalPaid,
        remaining: 0,
        status: 'active',
        contractType: 'Habitation',
        createdAt: daysAgo(200 - rentalNum * 8),
      },
    });

    await prisma.property.update({ where: { id: prop.id }, data: { status: 'loué' } });

    for (let p = 1; p <= 3; p++) {
      const receipt = `REC-LOC-${pad(rentalNum)}-${p}`;
      await prisma.payment.upsert({
        where: { receiptNo: receipt },
        update: { rentalId: rental.id },
        create: {
          receiptNo: receipt,
          rentalId: rental.id,
          date: daysAgo(60 - rentalNum - p * 10),
          amount: monthlyRent,
          nature: 'Loyer mensuel',
          operationType: p % 2 === 0 ? 'virement' : 'especes',
        },
      });
    }
  }

  for (let c = 20; c < 28; c++) await seedRental(c);
  for (let c = 0; c < 5; c++) await seedRental(c);

  // Encaissements récents (30 derniers jours) — historique encaissements visible dès l'ouverture
  const recentSales = await prisma.sale.findMany({
    take: 10,
    orderBy: { contractDate: 'desc' },
    select: { id: true, reference: true },
  });
  for (let i = 0; i < recentSales.length; i++) {
    const sale = recentSales[i];
    const receipt = `REC-RECENT-VTE-${pad(i + 1)}`;
    await prisma.payment.upsert({
      where: { receiptNo: receipt },
      update: {
        saleId: sale.id,
        date: daysAgo(i + 1),
        amount: 12000 + i * 1800,
      },
      create: {
        receiptNo: receipt,
        saleId: sale.id,
        date: daysAgo(i + 1),
        amount: 12000 + i * 1800,
        nature: i === 0 ? 'Avance' : i === recentSales.length - 1 ? 'Acompte' : 'Échéance',
        operationType: i % 3 === 0 ? 'especes' : i % 3 === 1 ? 'virement' : 'cheque',
        payerName: `Encaissement vente ${sale.reference}`,
      },
    });
  }

  const recentRentals = await prisma.rental.findMany({
    take: 6,
    orderBy: { contractDate: 'desc' },
    select: { id: true, reference: true },
  });
  for (let i = 0; i < recentRentals.length; i++) {
    const rental = recentRentals[i];
    const receipt = `REC-RECENT-LOC-${pad(i + 1)}`;
    await prisma.payment.upsert({
      where: { receiptNo: receipt },
      update: {
        rentalId: rental.id,
        date: daysAgo(i + 2),
        amount: 4500 + i * 300,
      },
      create: {
        receiptNo: receipt,
        rentalId: rental.id,
        date: daysAgo(i + 2),
        amount: 4500 + i * 300,
        nature: 'Loyer mensuel',
        operationType: i % 2 === 0 ? 'especes' : 'virement',
        payerName: `Locataire ${rental.reference}`,
      },
    });
  }

  // Documents par client (onglet Documents)
  const clientDocTypes = ['Pièce identité CIN', 'Contrat signé', 'Justificatif domicile', 'Relevé bancaire', 'Attestation salaire'];
  for (let i = 1; i <= 45; i++) {
    const docCount = i <= 15 ? 4 : i <= 30 ? 3 : 2;
    for (let j = 1; j <= docCount; j++) {
      await prisma.document.upsert({
        where: { id: `doc-cli-${i}-${j}` },
        update: { clientId: clientIds[i - 1] },
        create: {
          id: `doc-cli-${i}-${j}`,
          name: `${clientDocTypes[(j - 1) % clientDocTypes.length]} — Client ${i}`,
          category: ['identite', 'contrat', 'administratif', 'finance'][j % 4],
          mimeType: j % 2 === 0 ? 'application/pdf' : 'image/jpeg',
          size: 40000 + i * 800 + j * 5000,
          path: `/uploads/clients/cli-${i}-doc-${j}.pdf`,
          clientId: clientIds[i - 1],
        },
      });
    }
  }

  // Historique agent par client (onglet Agent)
  const agentsList = await prisma.agent.findMany();
  for (let i = 1; i <= 45; i++) {
    const clientId = clientIds[i - 1];
    const agentA = agentsList[i % agentsList.length];
    const agentB = agentsList[(i + 2) % agentsList.length];
    await prisma.clientAgentHistory.upsert({
      where: { id: `cah-${i}-1` },
      update: {},
      create: {
        id: `cah-${i}-1`,
        clientId,
        previousAgentId: null,
        previousAgentName: null,
        newAgentId: agentA.id,
        newAgentName: `${agentA.firstName} ${agentA.lastName}`,
        changedBy: 'admin@gic.ma',
        createdAt: daysAgo(50 - i),
      },
    });
    await prisma.clientAgentHistory.upsert({
      where: { id: `cah-${i}-2` },
      update: {},
      create: {
        id: `cah-${i}-2`,
        clientId,
        previousAgentId: agentA.id,
        previousAgentName: `${agentA.firstName} ${agentA.lastName}`,
        newAgentId: agentB.id,
        newAgentName: `${agentB.firstName} ${agentB.lastName}`,
        changedBy: 'admin@gic.ma',
        createdAt: daysAgo(25 - (i % 20)),
      },
    });
  }

  // Historique audit par client (onglet Historique)
  const clientAuditActions = ['création', 'modification', 'notification_email', 'liaison', 'photo'];
  for (let i = 1; i <= 45; i++) {
    for (let j = 0; j < 3; j++) {
      await prisma.auditLog.upsert({
        where: { id: `audit-cli-${i}-${j}` },
        update: { entityId: clientIds[i - 1] },
        create: {
          id: `audit-cli-${i}-${j}`,
          userId: admin.id,
          action: clientAuditActions[(i + j) % clientAuditActions.length],
          entity: 'Client',
          entityId: clientIds[i - 1],
          details: `Dossier CLI-2026-${pad(i)} — ${clientAuditActions[(i + j) % clientAuditActions.length]}`,
          createdAt: daysAgo(35 - i - j * 2),
        },
      });
    }
  }

  // (Mouvements caisse générés automatiquement en fin de seed — voir seedFinanceLedger)

  // Chantiers
  const chantierIds: string[] = [];
  for (const c of CHANTIERS) {
    const ch = await prisma.chantier.upsert({
      where: { id: c.id },
      update: { progressPct: c.progress, workerCount: c.workers, budgetAchats: c.budget },
      create: {
        id: c.id,
        name: c.name,
        address: `${c.city} — chantier résidentiel`,
        startDate: daysAgo(120),
        workerCount: c.workers,
        managerName: c.manager,
        status: c.progress >= 75 ? 'actif' : 'actif',
        progressPct: c.progress,
        budgetAchats: c.budget,
      },
    });
    chantierIds.push(ch.id);

    for (let t = 0; t < TASKS.length; t++) {
      const isRabat = c.id === 'chant-rabat';
      const tranche = isRabat ? (t < 12 ? 'Tranche 1' : 'Tranche 2') : 'Tranche 1';
      const groupe = isRabat ? (t % 2 === 0 ? 'GH1' : 'GH2') : `Groupe ${(t % 3) + 1}`;
      const etage = isRabat && t % 3 === 0 ? ['RDC', 'Étage 1', 'Étage 2', 'Étage 3'][t % 4] : undefined;
      const refPercents = [100, 92, 78, 73, 65, 58, 47, 32, 20, 8];
      const percent = isRabat
        ? refPercents[t % refPercents.length]
        : Math.min(100, Math.max(0, c.progress - 20 + (t * 7) % 40));
      await prisma.workProgress.upsert({
        where: { id: `wp-${c.id}-${t}` },
        update: { percent, tranche, groupe, etage: etage || null },
        create: {
          id: `wp-${c.id}-${t}`,
          chantierId: ch.id,
          taskName: TASKS[t],
          percent,
          tranche,
          groupe,
          etage: etage || null,
        },
      });
    }

    if (c.id === 'demo-chantier') {
      await prisma.chantierCamera.upsert({
        where: { id: 'cam-atlas-1' },
        update: {},
        create: {
          id: 'cam-atlas-1',
          chantierId: ch.id,
          name: 'Entrée principale',
          zone: 'Portail',
          url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&q=80',
        },
      });
      await prisma.chantierCamera.upsert({
        where: { id: 'cam-atlas-2' },
        update: {},
        create: {
          id: 'cam-atlas-2',
          chantierId: ch.id,
          name: 'Zone gros œuvre',
          zone: 'Bloc A — RDC',
          url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&q=80',
        },
      });
    }
    if (c.id === 'chant-rabat') {
      await prisma.chantierCamera.upsert({
        where: { id: 'cam-rabat-1' },
        update: {},
        create: {
          id: 'cam-rabat-1',
          chantierId: ch.id,
          name: 'Vue d\'ensemble',
          zone: 'Grue principale',
          url: 'https://images.unsplash.com/photo-1590856029826-c752a731c597?w=800&q=80',
        },
      });
    }
  }

  // Main-d'œuvre (28 ouvriers) — ~1/5 au mois (hors pointage) avec banque/RIB
  const workforceIds: string[] = [];
  const monthlyWorkforceIds: string[] = [];
  for (let i = 1; i <= 28; i++) {
    const id = i === 1 ? 'demo-worker' : `worker-${i}`;
    const isMonthly = i % 5 === 0;
    const bankName = isMonthly ? MAROC_BANKS[i % MAROC_BANKS.length] : null;
    const rib = isMonthly ? `007${pad(780000000 + i * 1111, 21)}`.slice(0, 24) : null;
    const w = await prisma.workforce.upsert({
      where: { id },
      update: {
        salaryPeriod: isMonthly ? 'mois' : 'jour',
        monthlySalary: isMonthly ? 4500 + (i % 5) * 400 : 0,
        dailySalary: isMonthly ? 0 : 180 + (i % 8) * 25,
        contractType: isMonthly ? 'Mensuel' : i % 4 === 0 ? 'Contrat' : 'Journalier',
        bankName,
        rib,
      },
      create: {
        id,
        firstName: randomItem(FIRST_NAMES, i + 15),
        lastName: randomItem(LAST_NAMES, i + 12),
        cin: `W${pad(100000 + i, 6)}`,
        phone1: `06${pad(40000000 + i * 33333, 8)}`.slice(0, 10),
        category: randomItem(WORKER_CATEGORIES, i),
        groupe: `Équipe ${String.fromCharCode(65 + (i % 4))}`,
        salaryPeriod: isMonthly ? 'mois' : 'jour',
        dailySalary: isMonthly ? 0 : 180 + (i % 8) * 25,
        monthlySalary: isMonthly ? 4500 + (i % 5) * 400 : 0,
        contractType: isMonthly ? 'Mensuel' : i % 4 === 0 ? 'Contrat' : 'Journalier',
        bankName,
        rib,
        declared: i % 3 !== 0,
        cnssNumber: i % 3 !== 0 ? `CNSS-${pad(i, 4)}` : undefined,
        hireDate: daysAgo(200 + i * 5),
        isActive: i !== 27,
      },
    });
    workforceIds.push(w.id);
    if (isMonthly) monthlyWorkforceIds.push(w.id);

    await prisma.workforceAssignment.upsert({
      where: { id: `wa-${i}` },
      update: {},
      create: {
        id: `wa-${i}`,
        workforceId: w.id,
        chantierId: randomItem(chantierIds, i),
        functionRole: randomItem(WORKER_CATEGORIES, i),
        startDate: daysAgo(90),
      },
    });
  }

  // Paie mensuelle seed (ouvriers au mois — période courante, à payer)
  for (let mi = 0; mi < monthlyWorkforceIds.length; mi++) {
    const wid = monthlyWorkforceIds[mi];
    const worker = await prisma.workforce.findUnique({ where: { id: wid } });
    if (!worker) continue;
    const brut = worker.monthlySalary || 5000;
    await prisma.workforcePayrollRecord.upsert({
      where: {
        workforceId_periodYear_periodMonth: {
          workforceId: wid,
          periodYear,
          periodMonth,
        },
      },
      update: {
        brut,
        netDue: brut,
        amountPaid: mi % 3 === 0 ? brut : mi % 3 === 1 ? Math.round(brut * 0.4) : 0,
        remaining: mi % 3 === 0 ? 0 : mi % 3 === 1 ? Math.round(brut * 0.6) : brut,
        status: mi % 3 === 0 ? 'paid' : mi % 3 === 1 ? 'partial' : 'pending',
        paymentMode: 'virement',
      },
      create: {
        reference: `MO-M-${pad(mi + 1, 4)}`,
        workforceId: wid,
        periodYear,
        periodMonth,
        brut,
        advances: 0,
        bonuses: 0,
        netDue: brut,
        amountPaid: mi % 3 === 0 ? brut : mi % 3 === 1 ? Math.round(brut * 0.4) : 0,
        remaining: mi % 3 === 0 ? 0 : mi % 3 === 1 ? Math.round(brut * 0.6) : brut,
        paymentMode: 'virement',
        status: mi % 3 === 0 ? 'paid' : mi % 3 === 1 ? 'partial' : 'pending',
        paidAt: mi % 3 === 0 ? daysAgo(2) : null,
        remark: `Salaire mensuel — ${worker.bankName || 'banque'}`,
      },
    });
  }

  // Chauffeurs (6) — 2 au mois (hors pointage) avec banque/RIB
  const chauffeurIds: string[] = [];
  const chauffeurNames: string[] = [];
  const monthlyChauffeurIds: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const id = i === 1 ? 'demo-chauffeur' : `chauffeur-${i}`;
    const firstName = randomItem(FIRST_NAMES, i + 40);
    const lastName = randomItem(LAST_NAMES, i + 35);
    const isMonthly = i === 2 || i === 5;
    const bankName = isMonthly ? MAROC_BANKS[(i + 3) % MAROC_BANKS.length] : null;
    const rib = isMonthly ? `013${pad(880000000 + i * 2222, 21)}`.slice(0, 24) : null;
    const w = await prisma.workforce.upsert({
      where: { id },
      update: {
        category: CHAUFFEUR_CATEGORY,
        salaryPeriod: isMonthly ? 'mois' : 'jour',
        monthlySalary: isMonthly ? 6000 + i * 200 : 0,
        dailySalary: isMonthly ? 0 : 220 + i * 15,
        contractType: isMonthly ? 'Mensuel' : 'Journalier',
        bankName,
        rib,
      },
      create: {
        id,
        reference: `CH-${pad(i, 4)}`,
        firstName,
        lastName,
        cin: `C${pad(200000 + i, 6)}`,
        phone1: `06${pad(50000000 + i * 44444, 8)}`.slice(0, 10),
        category: CHAUFFEUR_CATEGORY,
        groupe: i <= 3 ? 'Transport A' : 'Transport B',
        workPassport: `PC-${pad(1000 + i, 4)}`,
        salaryPeriod: isMonthly ? 'mois' : 'jour',
        dailySalary: isMonthly ? 0 : 220 + i * 15,
        monthlySalary: isMonthly ? 6000 + i * 200 : 0,
        contractType: isMonthly ? 'Mensuel' : 'Journalier',
        bankName,
        rib,
        declared: i % 2 === 0,
        cnssNumber: i % 2 === 0 ? `CNSS-CH-${pad(i, 3)}` : undefined,
        hireDate: daysAgo(150 + i * 10),
        isActive: i !== 6,
      },
    });
    chauffeurIds.push(w.id);
    chauffeurNames.push(`${firstName} ${lastName}`);
    if (isMonthly) monthlyChauffeurIds.push(w.id);

    await prisma.workforceAssignment.upsert({
      where: { id: `wa-ch-${i}` },
      update: {},
      create: {
        id: `wa-ch-${i}`,
        workforceId: w.id,
        chantierId: randomItem(chantierIds, i + 3),
        functionRole: CHAUFFEUR_CATEGORY,
        startDate: daysAgo(60),
      },
    });
  }

  for (let mi = 0; mi < monthlyChauffeurIds.length; mi++) {
    const wid = monthlyChauffeurIds[mi];
    const worker = await prisma.workforce.findUnique({ where: { id: wid } });
    if (!worker) continue;
    const brut = worker.monthlySalary || 6500;
    await prisma.workforcePayrollRecord.upsert({
      where: {
        workforceId_periodYear_periodMonth: { workforceId: wid, periodYear, periodMonth },
      },
      update: {
        brut,
        netDue: brut,
        amountPaid: 0,
        remaining: brut,
        status: 'pending',
        paymentMode: 'virement',
      },
      create: {
        reference: `CH-M-${pad(mi + 1, 4)}`,
        workforceId: wid,
        periodYear,
        periodMonth,
        brut,
        advances: 0,
        bonuses: 0,
        netDue: brut,
        amountPaid: 0,
        remaining: brut,
        paymentMode: 'virement',
        status: 'pending',
        remark: `Salaire mensuel chauffeur — ${worker.bankName || ''}`,
      },
    });
  }

  // Pointages chauffeurs (14 derniers jours) — journaliers seulement
  for (let d = 0; d < 14; d++) {
    const date = daysAgo(d);
    date.setHours(0, 0, 0, 0);
    for (let c = 0; c < chauffeurIds.length; c++) {
      const wid = chauffeurIds[c];
      if (monthlyChauffeurIds.includes(wid)) continue;
      const worker = await prisma.workforce.findUnique({ where: { id: wid }, select: { dailySalary: true } });
      const totalDay = c % 3 === 0 ? 1 : 0.5 + (d % 2) * 0.5;
      await prisma.pointage.upsert({
        where: { date_workforceId: { date, workforceId: wid } },
        update: {
          validated: d > 0,
          validatedAt: d > 0 ? daysAgo(d - 1) : null,
          advance: d === 0 && c === 0 ? 200 : 0,
          bonus: c === 1 && d % 5 === 0 ? 100 : 0,
          dayRate: worker?.dailySalary,
        },
        create: {
          date,
          workforceId: wid,
          chantierId: randomItem(chantierIds, c + d),
          dayValue: totalDay,
          hours: totalDay * 8,
          totalDay,
          dayRate: worker?.dailySalary,
          advance: d === 0 && c === 0 ? 200 : 0,
          bonus: c === 1 && d % 5 === 0 ? 100 : 0,
          validated: d > 0,
          validatedAt: d > 0 ? daysAgo(d - 1) : undefined,
        },
      });
    }
  }

  // Pointages (14 derniers jours × ouvriers journaliers) — hors mensuels
  for (let d = 0; d < 14; d++) {
    const date = daysAgo(d);
    date.setHours(0, 0, 0, 0);
    for (let w = 0; w < 20; w++) {
      const wid = workforceIds[w];
      if (monthlyWorkforceIds.includes(wid)) continue;
      const worker = await prisma.workforce.findUnique({ where: { id: wid }, select: { dailySalary: true } });
      const totalDay = 0.5 + ((w + d) % 2) * 0.5;
      await prisma.pointage.upsert({
        where: { date_workforceId: { date, workforceId: wid } },
        update: {
          validated: d > 0,
          validatedAt: d > 0 ? daysAgo(d - 1) : null,
          advance: d <= 2 && w % 4 === 0 ? 150 : d === 0 && w % 5 === 0 ? 100 : 0,
          bonus: w % 6 === 0 ? 80 : w % 7 === 0 ? 50 : 0,
          dayRate: worker?.dailySalary,
        },
        create: {
          date,
          workforceId: wid,
          chantierId: randomItem(chantierIds, w + d),
          dayValue: totalDay,
          hours: totalDay * 8,
          totalDay,
          dayRate: worker?.dailySalary,
          advance: d <= 2 && w % 4 === 0 ? 150 : d === 0 && w % 5 === 0 ? 100 : 0,
          bonus: w % 6 === 0 ? 80 : w % 7 === 0 ? 50 : 0,
          validated: d > 0,
          validatedAt: d > 0 ? daysAgo(d - 1) : undefined,
        },
      });
    }
  }

  // Fournisseurs + achats
  const supplierIds: string[] = [];
  for (const s of SUPPLIERS) {
    const idx = supplierIds.length;
    const sup = await prisma.supplier.upsert({
      where: { reference: s.ref },
      update: {
        passwordHash: s.portal ? supplierPwd : undefined,
        cin: `FR${pad(100000 + idx, 6)}`,
        source: ['Salon BTP', 'Recommandation', 'Appel d\'offres', 'Site web'][idx % 4],
        phone2: `06${pad(70000000 + idx * 11111, 8)}`.slice(0, 10),
      },
      create: {
        reference: s.ref,
        companyName: s.name,
        contactName: s.contact,
        phone1: `0522${pad(supplierIds.length + 1, 6)}`.slice(0, 10),
        phone2: `06${pad(70000000 + idx * 11111, 8)}`.slice(0, 10),
        cin: `FR${pad(100000 + idx, 6)}`,
        source: ['Salon BTP', 'Recommandation', 'Appel d\'offres', 'Site web'][idx % 4],
        email: s.email,
        address: 'Casablanca, Maroc',
        isActive: true,
        portalRole: 'ACHATS',
        passwordHash: s.portal ? supplierPwd : undefined,
      },
    });
    supplierIds.push(sup.id);
  }

  const purchaseStatuses = ['brouillon', 'validé', 'visé', 'contrôlé', 'retourné', 'validé', 'visé'];
  const modes = ['especes', 'virement', 'cheque', 'versement'];
  const purchaseLabels = [
    'Livraison béton C25/30', 'Ferraillage acier HA', 'Câblage électrique', 'Menuiserie aluminium',
    'Tuyauterie PVC', 'Carrelage sol 60×60', 'Location nacelle', 'Peinture façade',
    'Gravier concassé', 'Parpaings creux', 'Coffrage métallique', 'Échafaudage',
    'Ciment CPJ45', 'Sable de dune', 'Isolation laine de roche', 'Portes blindées',
  ];
  for (let i = 1; i <= 22; i++) {
    const ref = `ACH-2026-${pad(i)}`;
    const qty = 10 + (i % 20);
    const unitPrice = 150 + i * 85;
    const status = i <= 15 ? 'contrôlé' : randomItem(purchaseStatuses, i);
    const purchaseDate = i <= 15 ? daysAgo(i % 22) : daysAgo(40 - i);
    await prisma.purchase.upsert({
      where: { reference: ref },
      update: { status, date: purchaseDate },
      create: {
        reference: ref,
        date: purchaseDate,
        designation: purchaseLabels[i % purchaseLabels.length],
        quantity: qty,
        unit: i % 3 === 0 ? 'm³' : i % 3 === 1 ? 'kg' : 'u',
        unitPrice,
        totalPrice: qty * unitPrice,
        supplierId: randomItem(supplierIds, i),
        chantierId: randomItem(chantierIds, i),
        status,
        paymentMode: randomItem(modes, i),
        author: 'admin@gic.ma',
        family: 'Travaux',
      },
    });

    if (i <= 8) {
      await prisma.purchaseHistory.upsert({
        where: { id: `ph-${i}` },
        update: {},
        create: {
          id: `ph-${i}`,
          purchaseId: (await prisma.purchase.findUnique({ where: { reference: ref } }))!.id,
          userName: 'Super Administrateur',
          oldStatus: 'brouillon',
          newStatus: randomItem(purchaseStatuses, i),
          comment: 'Validation workflow GIC',
        },
      });
    }
  }

  for (let i = 23; i <= 30; i++) {
    const ref = `ACH-2026-${pad(i)}`;
    const qty = 8 + (i % 15);
    const unitPrice = 220 + i * 70;
    const purchaseDate = daysAgo((i - 22) * 2 + (i % 5));
    await prisma.purchase.upsert({
      where: { reference: ref },
      update: { status: 'contrôlé', date: purchaseDate },
      create: {
        reference: ref,
        date: purchaseDate,
        designation: purchaseLabels[i % purchaseLabels.length],
        quantity: qty,
        unit: i % 2 === 0 ? 'u' : 'kg',
        unitPrice,
        totalPrice: qty * unitPrice,
        supplierId: randomItem(supplierIds, i),
        chantierId: randomItem(chantierIds, i),
        status: 'contrôlé',
        paymentMode: randomItem(modes, i),
        author: 'admin@gic.ma',
        family: i % 2 === 0 ? 'Travaux' : 'Fournitures',
      },
    });
  }

  // Familles achats + catalogue désignations
  const familyDesignations: Record<string, string[]> = {
    'Gros œuvre': ['Livraison béton C25/30', 'Ferraillage acier HA', 'Coffrage métallique', 'Gravier concassé'],
    'Second œuvre': ['Menuiserie aluminium', 'Carrelage sol 60×60', 'Peinture façade', 'Faux plafonds'],
    'Électricité': ['Câblage électrique', 'Tableau électrique', 'Éclairage chantier'],
    'Plomberie': ['Tuyauterie PVC', 'Robinetterie', 'Pompe de relevage'],
    'Finitions': ['Parpaings creux', 'Enduit façade', 'Isolation thermique'],
  };
  for (const [fam, labels] of Object.entries(familyDesignations)) {
    const family = await prisma.purchaseFamily.upsert({
      where: { name: fam },
      update: {},
      create: { name: fam },
    });
    for (const label of labels) {
      const exists = await prisma.purchaseDesignation.findFirst({ where: { familyId: family.id, label } });
      if (!exists) {
        await prisma.purchaseDesignation.create({ data: { familyId: family.id, label } });
      }
    }
  }

  // Engins
  const enginIds: string[] = [];
  const MAINT_JOBS = [
    'Vidange + filtres', 'Révision moteur', 'Changement pneus', 'Freins + plaquettes',
    'Hydraulique — joints', 'Climatisation', 'Graissage général', 'Contrôle technique interne',
    'Remplacement courroie', 'Réparation carrosserie', 'Batterie + alternateur', 'Pneumatiques avant',
  ];
  const FUEL_STATIONS = ['Total Energies', 'Afriquia', 'Shell', 'Winxo', 'Station chantier GIC'];
  const in30 = new Date();
  in30.setDate(in30.getDate() + 20);
  const expired = daysAgo(10);
  for (let i = 0; i < ENGINS.length; i++) {
    const e = ENGINS[i];
    const engin = await prisma.engin.upsert({
      where: { matricule: e.mat },
      update: { status: e.status, fuelLevel: e.fuel, groupe: `Flotte ${String.fromCharCode(65 + (i % 3))}`, workPassport: `PO-${pad(i + 1, 4)}` },
      create: {
        brand: e.brand,
        genre: e.genre,
        matricule: e.mat,
        status: e.status,
        fuelLevel: e.fuel,
        groupe: `Flotte ${String.fromCharCode(65 + (i % 3))}`,
        workPassport: `PO-${pad(i + 1, 4)}`,
        purchasePrice: 400000 + i * 120000,
        counterValue: 800 + i * 340,
        counterUnit: i % 2 === 0 ? 'Hr' : 'KM',
        gpsNumber: `GPS-${pad(i + 1, 4)}`,
        insuranceExpiry: i === 3 ? expired : in30,
        vignetteExpiry: i === 1 ? in30 : daysAgo(-60),
        visitExpiry: daysAgo(-90),
      },
    });
    enginIds.push(engin.id);

    for (let f = 0; f < 5; f++) {
      await prisma.fuelLog.upsert({
        where: { id: f === 0 ? `fuel-${i}` : `fuel-${i}-${f}` },
        update: {
          date: daysAgo(f * 4 + i),
          liters: 55 + f * 18 + i * 5,
          cost: 850 + f * 140 + i * 65,
          remark: FUEL_STATIONS[(f + i) % FUEL_STATIONS.length],
        },
        create: {
          id: f === 0 ? `fuel-${i}` : `fuel-${i}-${f}`,
          enginId: engin.id,
          date: daysAgo(f * 4 + i),
          liters: 55 + f * 18 + i * 5,
          cost: 850 + f * 140 + i * 65,
          remark: FUEL_STATIONS[(f + i) % FUEL_STATIONS.length],
          counterValue: engin.counterValue + f * 12,
        },
      });
    }

    await prisma.gpsPosition.upsert({
      where: { id: `gps-${i}` },
      update: {},
      create: {
        id: `gps-${i}`,
        enginId: engin.id,
        lat: 33.5731 + i * 0.01,
        lng: -7.5898 + i * 0.01,
        source: i % 2 === 0 ? 'gps_tracker' : 'manual',
        recordedAt: daysAgo(i),
      },
    });

    await prisma.mission.upsert({
      where: { id: `mission-${i}` },
      update: {
        driverName: chauffeurNames[i % chauffeurNames.length] || randomItem(FIRST_NAMES, i),
      },
      create: {
        id: `mission-${i}`,
        enginId: engin.id,
        date: daysAgo(i * 3),
        driverName: chauffeurNames[i % chauffeurNames.length] || randomItem(FIRST_NAMES, i),
        mission: `Transport / terrassement chantier ${i + 1}`,
        chantierId: randomItem(chantierIds, i),
        requestedBy: 'Hassan Tazi',
      },
    });

    await prisma.maintenance.upsert({
      where: { id: `maint-${i}` },
      update: {
        date: daysAgo(8 + i * 2),
        budget: 3200 + i * 480,
        designation: MAINT_JOBS[i % MAINT_JOBS.length],
      },
      create: {
        id: `maint-${i}`,
        enginId: engin.id,
        date: daysAgo(8 + i * 2),
        designation: MAINT_JOBS[i % MAINT_JOBS.length],
        budget: 3200 + i * 480,
        responsible: 'Atelier GIC',
      },
    });
  }

  for (let j = 0; j < 18; j++) {
    await prisma.maintenance.upsert({
      where: { id: `maint-extra-${j}` },
      update: {
        date: daysAgo(j % 27),
        budget: 1600 + j * 380,
        designation: MAINT_JOBS[(j + 3) % MAINT_JOBS.length],
      },
      create: {
        id: `maint-extra-${j}`,
        enginId: enginIds[j % enginIds.length],
        date: daysAgo(j % 27),
        designation: MAINT_JOBS[(j + 3) % MAINT_JOBS.length],
        budget: 1600 + j * 380,
        responsible: ['Atelier GIC', 'Garage Partenaire', 'Technicien externe'][j % 3],
      },
    });
  }

  // Documents (30)
  for (let i = 1; i <= 30; i++) {
    await prisma.document.upsert({
      where: { id: `doc-${i}` },
      update: {},
      create: {
        id: `doc-${i}`,
        name: [
          'Contrat vente signé', 'Plan architectural', 'Facture fournisseur', 'Permis construire',
          'Attestation CNSS', 'PV réception', 'Devis menuiserie', 'Cahier des charges',
        ][i % 8] + ` — ${i}`,
        category: ['contrat', 'plan', 'facture', 'administratif', 'rh', 'technique'][i % 6],
        mimeType: i % 2 === 0 ? 'application/pdf' : 'image/jpeg',
        size: 50000 + i * 12000,
        path: `/uploads/demo-doc-${i}.pdf`,
        expiresAt: i <= 5 ? in30 : i === 6 ? expired : undefined,
        clientId: i <= 10 ? clientIds[i - 1] : undefined,
        propertyId: i > 10 && i <= 18 ? propertyIds[i - 11]?.id : undefined,
        chantierId: i > 18 && i <= 24 ? randomItem(chantierIds, i) : undefined,
        supplierId: i > 24 ? randomItem(supplierIds, i) : undefined,
      },
    });
  }

  // Bureau d'ordre (20)
  for (let i = 1; i <= 20; i++) {
    await prisma.archiveEntry.upsert({
      where: { id: `arch-${i}` },
      update: {},
      create: {
        id: `arch-${i}`,
        registerNo: `BO-2026-${pad(i, 4)}`,
        date: daysAgo(30 - i),
        subject: [
          'Demande permis de construire', 'Courrier préfecture', 'Réclamation voisinage',
          'Appel d\'offres fournisseur', 'Contrat sous-traitance', 'Réponse banque',
        ][i % 6],
        sender: i % 2 === 0 ? 'Préfecture Casablanca' : 'Client externe',
        recipient: 'Direction GIC',
        direction: i % 3 === 0 ? 'sortant' : 'entrant',
        category: ['administratif', 'juridique', 'commercial', 'technique'][i % 4],
      },
    });
  }

  // Notifications (12) — types alignés icônes UI (alert / achat / chantier / finance / doc…)
  const notifs = [
    { title: 'Bienvenue sur GIC', message: 'La plateforme est prête. Explorez le tableau de bord.', type: 'info', link: '/' },
    { title: 'Encaissements en attente', message: '3 ventes ont un reste à encaisser > 100 000 MAD', type: 'finance', link: '/encaissements' },
    { title: 'Achats à valider', message: '4 bons d’achat sont encore en brouillon', type: 'achat', link: '/achats' },
    { title: 'Documents expirants', message: '5 documents arrivent à échéance sous 30 jours', type: 'doc', link: '/documents' },
    { title: 'Pointage du jour', message: 'Validez les pointages avant 18h', type: 'chantier', link: '/pointage' },
    { title: 'Engin en maintenance', message: 'JCB Mini-pelle — maintenance en cours', type: 'alert', link: '/engins' },
    { title: 'Nouveau client', message: 'Un prospect a été converti en acheteur', type: 'success', link: '/clients' },
    { title: 'Chantier Rabat', message: 'Avancement 62 % — objectif mensuel atteint', type: 'chantier', link: '/chantiers/chant-rabat' },
    { title: 'Location à échéance', message: '2 baux arrivent à terme ce mois', type: 'warning', link: '/locations' },
    { title: 'Devis fournisseur', message: 'Béton Atlas a déposé un nouveau devis', type: 'achat', link: '/achats' },
    { title: 'Mouvement de caisse', message: 'Solde caisse principale mis à jour', type: 'finance', link: '/balance' },
    { title: 'Journal d’audit', message: '12 actions enregistrées cette semaine', type: 'info', link: '/audit' },
  ];
  for (let i = 0; i < notifs.length; i++) {
    const n = notifs[i];
    await prisma.notification.upsert({
      where: { id: `notif-${i + 1}` },
      update: {
        title: n.title,
        message: n.message,
        type: n.type,
        link: n.link,
        isRead: i > 5,
        createdAt: daysAgo(i),
      },
      create: {
        id: `notif-${i + 1}`,
        userId: admin.id,
        ...n,
        isRead: i > 5,
        createdAt: daysAgo(i),
      },
    });
  }

  // Audit logs (20)
  const auditActions = [
    ['connexion', 'User'], ['création', 'Client'], ['création', 'Sale'], ['modification', 'Property'],
    ['upload', 'Document'], ['création', 'Purchase'], ['workflow', 'Purchase'], ['création', 'Workforce'],
    ['pointage', 'Pointage'], ['création', 'Chantier'], ['modification', 'Supplier'], ['création', 'Rental'],
  ];
  for (let i = 0; i < 20; i++) {
    const [action, entity] = auditActions[i % auditActions.length];
    await prisma.auditLog.upsert({
      where: { id: `audit-${i}` },
      update: {},
      create: {
        id: `audit-${i}`,
        userId: admin.id,
        action,
        entity,
        details: `Action démo seed #${i + 1}`,
        createdAt: daysAgo(20 - i),
      },
    });
  }

  // Compteurs
  const counters = [
    { id: 'CLI-2026', prefix: 'CLI', year: 2026, value: 45 },
    { id: 'BIEN-2026', prefix: 'BIEN', year: 2026, value: 90 },
    { id: 'VTE-2026', prefix: 'VTE', year: 2026, value: 35 },
    { id: 'LOC-2026', prefix: 'LOC', year: 2026, value: 13 },
    { id: 'FRN-2026', prefix: 'FRN', year: 2026, value: 8 },
    { id: 'ACH-2026', prefix: 'ACH', year: 2026, value: 30 },
    { id: 'COL-2026', prefix: 'COL', year: 2026, value: 8 },
    { id: 'REC-2026', prefix: 'REC', year: 2026, value: 4 },
  ];
  for (const c of counters) {
    await prisma.counter.upsert({
      where: { prefix_year: { prefix: c.prefix, year: c.year } },
      update: { value: c.value },
      create: c,
    });
  }

  // Dropdowns
  const dropdowns = [
    { category: 'identity_type', label: 'CIN', value: 'CIN', sortOrder: 1 },
    { category: 'identity_type', label: 'Passeport', value: 'Passeport', sortOrder: 2 },
    { category: 'payment_mode', label: 'Espèces', value: 'especes', sortOrder: 1 },
    { category: 'payment_mode', label: 'Virement', value: 'virement', sortOrder: 2 },
    { category: 'payment_mode', label: 'Chèque', value: 'cheque', sortOrder: 3 },
    { category: 'property_status', label: 'Disponible', value: 'disponible', sortOrder: 1 },
    { category: 'property_status', label: 'Réservé', value: 'réservé', sortOrder: 2 },
    { category: 'property_status', label: 'Vendu', value: 'vendu', sortOrder: 3 },
    { category: 'property_status', label: 'Loué', value: 'loué', sortOrder: 4 },
    { category: 'payment_nature', label: 'Avance', value: 'Avance', sortOrder: 1 },
    { category: 'payment_nature', label: 'Échéance', value: 'Échéance', sortOrder: 2 },
    { category: 'payment_nature', label: 'Loyer', value: 'Loyer', sortOrder: 3 },
    { category: 'payment_nature', label: 'Solde', value: 'Solde', sortOrder: 4 },
    { category: 'payment_nature', label: 'Acompte', value: 'Acompte', sortOrder: 5 },
    { category: 'payment_nature', label: 'Mensualité', value: 'Mensualité', sortOrder: 6 },
    { category: 'purchase_unit', label: 'Unité', value: 'Unité', sortOrder: 1 },
    { category: 'purchase_unit', label: 'm²', value: 'm²', sortOrder: 2 },
    { category: 'purchase_unit', label: 'm³', value: 'm³', sortOrder: 3 },
    { category: 'purchase_unit', label: 'tonne', value: 'tonne', sortOrder: 4 },
    { category: 'purchase_unit', label: 'kg', value: 'kg', sortOrder: 5 },
    { category: 'purchase_unit', label: 'litre', value: 'litre', sortOrder: 6 },
    { category: 'purchase_unit', label: 'pièce', value: 'pièce', sortOrder: 7 },
    { category: 'purchase_unit', label: 'lot', value: 'lot', sortOrder: 8 },
    { category: 'purchase_unit', label: 'forfait', value: 'forfait', sortOrder: 9 },
    { category: 'work_category', label: 'Maçon', value: 'macon', sortOrder: 1 },
    { category: 'work_category', label: 'Manœuvre', value: 'manoeuvre', sortOrder: 2 },
    { category: 'client_source', label: 'Recommandation', value: 'Recommandation', sortOrder: 1 },
    { category: 'client_source', label: 'Site web', value: 'Site web', sortOrder: 2 },
    { category: 'client_source', label: 'Salon immobilier', value: 'Salon immobilier', sortOrder: 3 },
    { category: 'client_source', label: 'Agent commercial', value: 'Agent commercial', sortOrder: 4 },
    { category: 'client_source', label: 'Réseaux sociaux', value: 'Réseaux sociaux', sortOrder: 5 },
  ];
  for (const d of dropdowns) {
    const exists = await prisma.dropdownOption.findFirst({ where: { category: d.category, value: d.value } });
    if (!exists) await prisma.dropdownOption.create({ data: d });
  }

  await seedFinanceLedger();

  console.log('\n✅ Seed GIC complet — plateforme remplie\n');
  console.log('Compte admin     : admin@gic.ma / Admin@2026');
  console.log('Comptable        : comptable@gic.ma / Comptable@2026');
  console.log('Commercial       : commercial@gic.ma / Commercial@2026');
  console.log('Chef de chantier : chef@gic.ma / Chef@2026');
  console.log('Portail fournisseur: contact@beton-atlas.ma / Fournisseur@2026');
  console.log('---');
  console.log('Équipe interne   : 8 collaborateurs — paie mensuelle/hebdo/journalière/trimestrielle');
  console.log('Salaires         : MO (/salaires) + équipe interne (/salaires-equipe-interne) séparés');
  console.log('Clients          : 45 (fiches complètes : ventes, locations, docs, mandants, agent, historique)');
  console.log('Projets          : 6 (+ hiérarchie tranches/blocs/lots/étages)');
  console.log('Biens            : 90');
  console.log('Ventes           : 35 (liées aux clients)');
  console.log('Locations        : 13 (liées aux clients)');
  console.log('Chantiers        : 5');
  console.log('Ouvriers         : 28 (+ pointages 14 jours)');
  console.log('Chauffeurs       : 6 (+ pointages, salaires CH-*, décaissements)');
  console.log('Fournisseurs     : 8');
  console.log('Achats           : 30 (23 contrôlés → décaissements caisse)');
  console.log('Maintenance      : 24 entrées (décaissements onglet maintenance)');
  console.log('Carburant        : 30 pleins (décaissements onglet carburant)');
  console.log('Finance          : encaissements + décaissements → caisse auto (voir ci-dessus)');
  console.log('Engins           : 6');
  console.log('Documents        : 30');
  console.log('Bureau d\'ordre   : 20');
  console.log('Notifications    : 12');
  console.log('Reconnus         : 4 (+ 5 mouvements caisse bureau)');
  console.log('\nRelancez : cd backend && npx prisma db push && npm run seed\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
