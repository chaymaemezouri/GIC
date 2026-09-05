import { Router } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { sendExcel } from '../lib/exportExcel.js';
import { upload } from '../lib/upload.js';
import { nextReference } from '../lib/references.js';
import { staffDocHtml, computeStaffNet, monthLabel } from '../lib/staffPrint.js';
import { syncStaffSalaryMovement } from '../lib/cashSync.js';
import {
  baseSalaryForPeriod,
  currentWeekOfMonth,
  normalizeSalaryPeriod,
  periodDisplayLabel,
  SALARY_PERIOD_LABELS,
  salaryPeriodUnitLabel,
} from '../lib/staffSalaryPeriod.js';

const router = Router();
router.use(requireAuth);

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'COMPTABLE'] as const;
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
const USER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'COMPTABLE', 'COMMERCIAL', 'CHEF_CHANTIER', 'USER'] as const;

const staffSelect = {
  id: true,
  reference: true,
  firstName: true,
  lastName: true,
  photo: true,
  email: true,
  cin: true,
  birthDate: true,
  address: true,
  phone1: true,
  phone2: true,
  jobTitle: true,
  department: true,
  hireDate: true,
  contractType: true,
  monthlySalary: true,
  salaryPeriod: true,
  declared: true,
  cnssNumber: true,
  bankAccount: true,
  bankName: true,
  rib: true,
  emergencyContact: true,
  remark: true,
  isActive: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      twoFactorEnabled: true,
      lastLoginAt: true,
    },
  },
} as const;

function parseOptionalDate(v: unknown) {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function applyStaffFields(data: Record<string, unknown>, body: Record<string, unknown>) {
  if (body.firstName != null) data.firstName = String(body.firstName).trim();
  if (body.lastName != null) data.lastName = String(body.lastName).trim();
  if (body.email !== undefined) data.email = body.email ? String(body.email).trim().toLowerCase() : null;
  if (body.cin !== undefined) data.cin = body.cin ? String(body.cin).trim() : null;
  if (body.birthDate !== undefined) data.birthDate = parseOptionalDate(body.birthDate);
  if (body.address !== undefined) data.address = body.address ? String(body.address).trim() : null;
  if (body.phone1 !== undefined) data.phone1 = body.phone1 ? String(body.phone1).trim() : null;
  if (body.phone2 !== undefined) data.phone2 = body.phone2 ? String(body.phone2).trim() : null;
  if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle ? String(body.jobTitle).trim() : null;
  if (body.department !== undefined) data.department = body.department ? String(body.department).trim() : null;
  if (body.hireDate !== undefined) data.hireDate = parseOptionalDate(body.hireDate);
  if (body.contractType !== undefined) data.contractType = body.contractType ? String(body.contractType).trim() : null;
  if (body.monthlySalary !== undefined) data.monthlySalary = Number(body.monthlySalary) || 0;
  if (body.salaryPeriod !== undefined) data.salaryPeriod = normalizeSalaryPeriod(body.salaryPeriod);
  if (body.declared !== undefined) data.declared = Boolean(body.declared);
  if (body.cnssNumber !== undefined) data.cnssNumber = body.cnssNumber ? String(body.cnssNumber).trim() : null;
  if (body.bankName !== undefined) data.bankName = body.bankName ? String(body.bankName).trim() : null;
  if (body.rib !== undefined) {
    const rib = body.rib ? String(body.rib).trim() : null;
    data.rib = rib;
    // Compat anciens écrans / exports
    data.bankAccount = rib;
  } else if (body.bankAccount !== undefined) {
    data.bankAccount = body.bankAccount ? String(body.bankAccount).trim() : null;
    if (data.rib === undefined) data.rib = data.bankAccount;
  }
  if (body.emergencyContact !== undefined) data.emergencyContact = body.emergencyContact ? String(body.emergencyContact).trim() : null;
  if (body.remark !== undefined) data.remark = body.remark ? String(body.remark).trim() : null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
}

function buildStaffWhere(q: string, active: string, department: string) {
  return {
    AND: [
      q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { email: { contains: q } },
              { reference: { contains: q } },
              { jobTitle: { contains: q } },
              { department: { contains: q } },
              { cin: { contains: q } },
              { phone1: { contains: q } },
            ],
          }
        : {},
      active === 'true' ? { isActive: true } : active === 'false' ? { isActive: false } : {},
      department ? { department } : {},
    ],
  };
}

router.get('/stats', requireRole(...STAFF_ROLES), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const active = String(req.query.active || '');
  const department = String(req.query.department || '');
  const where = buildStaffWhere(q, active, department);

  const [total, actifs, declared, payroll, withAccount] = await Promise.all([
    prisma.internalStaff.count({ where }),
    prisma.internalStaff.count({ where: { ...where, isActive: true } }),
    prisma.internalStaff.count({ where: { ...where, declared: true } }),
    prisma.internalStaff.aggregate({
      where: { ...where, isActive: true },
      _sum: { monthlySalary: true },
      _avg: { monthlySalary: true },
    }),
    prisma.internalStaff.count({ where: { ...where, userId: { not: null } } }),
  ]);

  res.json({
    total,
    actifs,
    inactifs: total - actifs,
    declared,
    withAccount,
    payrollTotal: payroll._sum.monthlySalary || 0,
    avgSalary: Math.round((payroll._avg.monthlySalary || 0) * 100) / 100,
  });
});

router.get('/export/csv', requireRole(...STAFF_ROLES), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const active = String(req.query.active || '');
  const department = String(req.query.department || '');
  const where = buildStaffWhere(q, active, department);

  const items = await prisma.internalStaff.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: staffSelect,
  });

  const header = 'Réf.;Prénom;Nom;Email;Fonction;Service;Salaire mensuel;CNSS;Compte plateforme;Statut';
  const rows = items.map((s) =>
    [
      s.reference || '',
      s.firstName,
      s.lastName,
      s.email || s.user?.email || '',
      s.jobTitle || '',
      s.department || '',
      s.monthlySalary ?? 0,
      s.declared ? 'Oui' : 'Non',
      s.user ? 'Oui' : 'Non',
      s.isActive ? 'Actif' : 'Inactif',
    ].join(';'),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=equipe-interne-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

router.get('/export/xlsx', requireRole(...STAFF_ROLES), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const active = String(req.query.active || '');
  const department = String(req.query.department || '');
  const where = buildStaffWhere(q, active, department);

  const items = await prisma.internalStaff.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: staffSelect,
    take: 5000,
  });

  sendExcel(
    res,
    'equipe-interne-gic.xlsx',
    'Équipe interne',
    items.map((s) => ({
      Référence: s.reference || '',
      Prénom: s.firstName,
      Nom: s.lastName,
      Email: s.email || s.user?.email || '',
      Fonction: s.jobTitle || '',
      Service: s.department || '',
      'Salaire mensuel': s.monthlySalary ?? 0,
      CNSS: s.declared ? 'Oui' : 'Non',
      'Compte plateforme': s.user ? 'Oui' : 'Non',
      Statut: s.isActive ? 'Actif' : 'Inactif',
      'Créé le': s.createdAt.toISOString().slice(0, 10),
    })),
  );
});

router.get('/available-users', requireRole(...ADMIN_ROLES), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { internalStaff: null, isActive: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
    take: 200,
  });
  res.json(users);
});

router.get('/salaires/stats', requireRole(...STAFF_ROLES), async (req, res) => {
  const periodYear = Number(req.query.periodYear) || new Date().getFullYear();
  const periodMonth = Number(req.query.periodMonth) || new Date().getMonth() + 1;
  const periodWeek = Number(req.query.periodWeek) || 0;
  const q = String(req.query.q || '').trim();
  const department = String(req.query.department || '');
  const active = String(req.query.active || 'true');
  const where = buildStaffWhere(q, active, department);

  const staffList = await prisma.internalStaff.findMany({
    where,
    select: { id: true, monthlySalary: true, salaryPeriod: true, isActive: true },
  });

  const records = await prisma.internalStaffSalaryRecord.findMany({
    where: { periodYear, periodMonth, ...(periodWeek ? { periodWeek } : {}) },
    select: { staffId: true, netSalary: true, advance: true, bonus: true, status: true },
  });
  const byStaff = new Map(records.map((r) => [r.staffId, r]));

  let totalBrut = 0;
  let totalNet = 0;
  let totalPaid = 0;
  let totalRemaining = 0;
  let totalAdvances = 0;
  let totalBonuses = 0;
  let paidCount = 0;
  let draftCount = 0;
  let withRecord = 0;

  for (const s of staffList) {
    const rec = byStaff.get(s.id);
    const period = normalizeSalaryPeriod(s.salaryPeriod);
    const defaultBase = baseSalaryForPeriod(s.monthlySalary, period);
    const baseSalary = rec?.baseSalary ?? defaultBase;
    const bonus = rec?.bonus ?? 0;
    const advance = rec?.advance ?? 0;
    const netDue = rec?.netSalary ?? computeStaffNet(baseSalary, bonus, rec?.deduction ?? 0, advance).net;
    const amountPaid = rec?.status === 'payé' ? netDue : 0;
    const remaining = rec?.status === 'payé' ? 0 : netDue;

    totalBrut += baseSalary + bonus;
    totalAdvances += advance;
    totalBonuses += bonus;
    totalNet += netDue;
    totalPaid += amountPaid;
    totalRemaining += remaining;
    if (rec) withRecord += 1;
    if (rec?.status === 'payé') paidCount += 1;
    else if (rec?.status === 'brouillon') draftCount += 1;
  }

  res.json({
    totalStaff: staffList.length,
    actifs: staffList.filter((s) => s.isActive).length,
    withRecord,
    paidCount,
    draftCount,
    pendingCount: staffList.length - paidCount,
    totalBrut: Math.round(totalBrut),
    totalNet: Math.round(totalNet),
    totalPaid: Math.round(totalPaid),
    totalRemaining: Math.round(totalRemaining),
    totalAdvances: Math.round(totalAdvances),
    totalBonuses: Math.round(totalBonuses),
    totalPending: Math.round(totalRemaining),
    periodYear,
    periodMonth,
    periodWeek,
  });
});

router.get('/salaires', requireRole(...STAFF_ROLES), async (req, res) => {
  const periodYear = Number(req.query.periodYear) || new Date().getFullYear();
  const periodMonth = Number(req.query.periodMonth) || new Date().getMonth() + 1;
  let periodWeek = req.query.periodWeek != null ? Number(req.query.periodWeek) : 0;
  const statusFilter = String(req.query.status || '');
  const q = String(req.query.q || '').trim();
  const department = String(req.query.department || '');
  const active = String(req.query.active || 'true');
  const sort = String(req.query.sort || 'lastName');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildStaffWhere(q, active, department);

  const orderBy =
    sort === 'department'
      ? { department: order as 'asc' | 'desc' }
      : sort === 'monthlySalary'
        ? { monthlySalary: order as 'asc' | 'desc' }
        : sort === 'jobTitle'
          ? { jobTitle: order as 'asc' | 'desc' }
          : { lastName: order as 'asc' | 'desc' };

  const [staffList, total] = await Promise.all([
    prisma.internalStaff.findMany({ where, orderBy, skip, take: limit, select: staffSelect }),
    prisma.internalStaff.count({ where }),
  ]);

  const staffIds = staffList.map((s) => s.id);
  const records = staffIds.length
    ? await prisma.internalStaffSalaryRecord.findMany({
        where: {
          staffId: { in: staffIds },
          periodYear,
          periodMonth,
          ...(periodWeek ? { periodWeek } : {}),
        },
      })
    : [];
  const byStaff = new Map<string, typeof records[0]>();
  for (const s of staffList) {
    const period = normalizeSalaryPeriod(s.salaryPeriod);
    const effectiveWeek =
      periodWeek ||
      (period === 'hebdomadaire' || period === 'journalier' || period === 'bihebdomadaire'
        ? currentWeekOfMonth()
        : 0);
    const rec =
      records.find((r) => r.staffId === s.id && r.periodWeek === effectiveWeek) ||
      records.find((r) => r.staffId === s.id && r.periodWeek === 0) ||
      records.find((r) => r.staffId === s.id);
    if (rec) byStaff.set(s.id, rec);
  }

  let rows = staffList.map((s) => {
    const period = normalizeSalaryPeriod(s.salaryPeriod);
    const rec = byStaff.get(s.id);
    const effectiveWeek = rec?.periodWeek ?? (periodWeek || (period !== 'mensuel' && period !== 'trimestriel' ? currentWeekOfMonth() : 0));
    const defaultBase = baseSalaryForPeriod(s.monthlySalary, period);
    const baseSalary = rec?.baseSalary ?? defaultBase;
    const bonus = rec?.bonus ?? 0;
    const deduction = rec?.deduction ?? 0;
    const advance = rec?.advance ?? 0;
    const netSalary = rec?.netSalary ?? computeStaffNet(baseSalary, bonus, deduction, advance).net;
    const status = rec?.status ?? 'pending';
    const amountPaid = status === 'payé' ? netSalary : 0;
    const remaining = status === 'payé' ? 0 : netSalary;
    const brut = baseSalary + bonus;
    return {
      id: s.id,
      reference: s.reference,
      firstName: s.firstName,
      lastName: s.lastName,
      jobTitle: s.jobTitle,
      department: s.department,
      isActive: s.isActive,
      monthlySalary: s.monthlySalary,
      salaryPeriod: period,
      salaryPeriodLabel: SALARY_PERIOD_LABELS[period],
      salary: {
        recordId: rec?.id ?? null,
        periodYear,
        periodMonth,
        periodWeek: effectiveWeek,
        salaryPeriod: rec?.salaryPeriod ?? period,
        periodLabel: periodDisplayLabel(periodYear, periodMonth, effectiveWeek, rec?.salaryPeriod ?? period),
        baseSalary,
        bonus,
        deduction,
        advance,
        brut,
        netSalary,
        netDue: netSalary,
        amountPaid,
        remaining,
        status,
        paidAt: rec?.paidAt ?? null,
        remark: rec?.remark ?? null,
      },
    };
  });

  if (statusFilter === 'payé' || statusFilter === 'brouillon' || statusFilter === 'validé' || statusFilter === 'pending') {
    rows = rows.filter((r) => r.salary.status === statusFilter);
  }

  res.json({
    items: rows,
    total: statusFilter ? rows.length : total,
    page,
    limit,
    pages: Math.ceil((statusFilter ? rows.length : total) / limit) || 1,
    periodYear,
    periodMonth,
    periodWeek,
  });
});

router.get('/salaires/export/csv', requireRole(...STAFF_ROLES), async (req, res) => {
  const periodYear = Number(req.query.periodYear) || new Date().getFullYear();
  const periodMonth = Number(req.query.periodMonth) || new Date().getMonth() + 1;
  const periodWeek = Number(req.query.periodWeek) || 0;
  const q = String(req.query.q || '').trim();
  const active = String(req.query.active || 'true');
  const where = buildStaffWhere(q, active, '');

  const staffList = await prisma.internalStaff.findMany({
    where,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: staffSelect,
    take: 5000,
  });

  const records = await prisma.internalStaffSalaryRecord.findMany({
    where: { periodYear, periodMonth, ...(periodWeek ? { periodWeek } : {}) },
  });
  const byStaff = new Map(records.map((r) => [r.staffId, r]));

  const header = 'Réf.;Collaborateur;Service;Période;Base;Primes;Retenues;Avances;Net dû;Payé;Reste;Statut';
  const rows = staffList.map((s) => {
    const rec = byStaff.get(s.id);
    const period = normalizeSalaryPeriod(s.salaryPeriod);
    const base = rec?.baseSalary ?? baseSalaryForPeriod(s.monthlySalary, period);
    const bonus = rec?.bonus ?? 0;
    const deduction = rec?.deduction ?? 0;
    const advance = rec?.advance ?? 0;
    const net = rec?.netSalary ?? computeStaffNet(base, bonus, deduction, advance).net;
    const paid = rec?.status === 'payé' ? net : 0;
    const reste = rec?.status === 'payé' ? 0 : net;
    return [
      s.reference || '',
      `${s.firstName} ${s.lastName}`,
      s.department || '',
      periodDisplayLabel(periodYear, periodMonth, rec?.periodWeek ?? periodWeek, period),
      base,
      bonus,
      deduction,
      advance,
      net,
      paid,
      reste,
      rec?.status || 'pending',
    ].join(';');
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=salaires-equipe-interne-gic.csv');
  res.send('\uFEFF' + [header, ...rows].join('\n'));
});

async function resolveStaffPeriodWeek(staff: { salaryPeriod: string }, periodWeek: number) {
  const period = normalizeSalaryPeriod(staff.salaryPeriod);
  return periodWeek || (period !== 'mensuel' && period !== 'trimestriel' ? currentWeekOfMonth() : 0);
}

router.post('/salaires/save', requireRole(...STAFF_ROLES), async (req, res) => {
  const periodYear = Number(req.body.periodYear) || new Date().getFullYear();
  const periodMonth = Number(req.body.periodMonth) || new Date().getMonth() + 1;
  const periodWeek = Number(req.body.periodWeek) || 0;
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ message: 'Aucune ligne à enregistrer' });

  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const staffId = String(row.staffId || '');
    if (!staffId) continue;
    const staff = await prisma.internalStaff.findUnique({ where: { id: staffId } });
    if (!staff) {
      errors.push(`Collaborateur introuvable: ${staffId}`);
      continue;
    }
    const effectiveWeek = await resolveStaffPeriodWeek(staff, periodWeek);
    const existing = await prisma.internalStaffSalaryRecord.findUnique({
      where: { staffId_periodYear_periodMonth_periodWeek: { staffId, periodYear, periodMonth, periodWeek: effectiveWeek } },
    });
    if (existing && (existing.status === 'validé' || existing.status === 'payé')) {
      skipped += 1;
      continue;
    }
    const salaryPeriod = normalizeSalaryPeriod(staff.salaryPeriod);
    const defaultBase = baseSalaryForPeriod(staff.monthlySalary, salaryPeriod);
    const baseSalary = row.baseSalary != null ? Number(row.baseSalary) : defaultBase;
    const bonus = Number(row.bonus) || 0;
    const deduction = Number(row.deduction) || 0;
    const advance = Number(row.advance) || 0;
    const { net } = computeStaffNet(baseSalary, bonus, deduction, advance);
    await prisma.internalStaffSalaryRecord.upsert({
      where: { staffId_periodYear_periodMonth_periodWeek: { staffId, periodYear, periodMonth, periodWeek: effectiveWeek } },
      create: {
        staffId,
        periodYear,
        periodMonth,
        periodWeek: effectiveWeek,
        salaryPeriod,
        baseSalary,
        bonus,
        deduction,
        advance,
        netSalary: net,
        status: 'brouillon',
        remark: row.remark ? String(row.remark) : null,
      },
      update: {
        salaryPeriod,
        baseSalary,
        bonus,
        deduction,
        advance,
        netSalary: net,
        status: 'brouillon',
        ...(row.remark !== undefined ? { remark: row.remark ? String(row.remark) : null } : {}),
      },
    });
    saved += 1;
  }

  await audit(
    req,
    'modification',
    'InternalStaff',
    undefined,
    `Salaires enregistrés — ${periodMonth}/${periodYear} (${saved} ligne(s))`,
  );
  res.json({ saved, skipped, errors });
});

router.post('/salaires/validate', requireRole(...STAFF_ROLES), async (req, res) => {
  const periodYear = Number(req.body.periodYear) || new Date().getFullYear();
  const periodMonth = Number(req.body.periodMonth) || new Date().getMonth() + 1;
  const periodWeek = Number(req.body.periodWeek) || 0;
  const staffIds = Array.isArray(req.body.staffIds) ? req.body.staffIds.map(String) : null;

  const records = await prisma.internalStaffSalaryRecord.findMany({
    where: {
      periodYear,
      periodMonth,
      ...(periodWeek ? { periodWeek } : {}),
      status: 'brouillon',
      ...(staffIds?.length ? { staffId: { in: staffIds } } : {}),
    },
  });

  if (!records.length) {
    return res.status(400).json({ message: 'Aucun bulletin brouillon à valider pour cette période' });
  }

  await prisma.internalStaffSalaryRecord.updateMany({
    where: { id: { in: records.map((r) => r.id) } },
    data: { status: 'validé' },
  });

  await audit(
    req,
    'workflow',
    'InternalStaff',
    undefined,
    `Salaires validés — ${periodMonth}/${periodYear} (${records.length} bulletin(s))`,
  );
  res.json({ validated: records.length });
});

router.post('/salaires/:staffId/pay', requireRole(...STAFF_ROLES), async (req, res) => {
  const staffId = String(req.params.staffId);
  const periodYear = Number(req.body.periodYear) || new Date().getFullYear();
  const periodMonth = Number(req.body.periodMonth) || new Date().getMonth() + 1;
  const periodWeek = Number(req.body.periodWeek) || 0;
  const paymentMode = String(req.body.paymentMode || 'virement');

  const staff = await prisma.internalStaff.findUnique({ where: { id: staffId } });
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });

  const effectiveWeek = await resolveStaffPeriodWeek(staff, periodWeek);
  const record = await prisma.internalStaffSalaryRecord.findUnique({
    where: { staffId_periodYear_periodMonth_periodWeek: { staffId, periodYear, periodMonth, periodWeek: effectiveWeek } },
  });

  if (!record) {
    return res.status(400).json({ message: 'Aucun bulletin enregistré pour cette période — saisissez et validez d\'abord' });
  }
  if (record.status === 'payé') {
    return res.status(400).json({ message: 'Bulletin déjà payé' });
  }
  if (record.status !== 'validé') {
    return res.status(400).json({ message: 'Le bulletin doit être validé avant paiement' });
  }

  const updated = await prisma.internalStaffSalaryRecord.update({
    where: { id: record.id },
    data: { status: 'payé', paidAt: new Date() },
    include: { staff: { select: { firstName: true, lastName: true } } },
  });

  await syncStaffSalaryMovement(updated, req);
  await audit(req, 'paie', 'InternalStaff', staffId, `${staff.firstName} ${staff.lastName} — ${periodMonth}/${periodYear}`);

  res.json({
    id: updated.id,
    netSalary: updated.netSalary,
    status: updated.status,
    paidAt: updated.paidAt,
    paymentMode,
  });
});

router.get('/', requireRole(...STAFF_ROLES), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const active = String(req.query.active || '');
  const department = String(req.query.department || '');
  const sort = String(req.query.sort || 'lastName');
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;
  const where = buildStaffWhere(q, active, department);

  const orderBy =
    sort === 'firstName'
      ? { firstName: order as 'asc' | 'desc' }
      : sort === 'jobTitle'
        ? { jobTitle: order as 'asc' | 'desc' }
        : sort === 'department'
          ? { department: order as 'asc' | 'desc' }
          : sort === 'monthlySalary'
            ? { monthlySalary: order as 'asc' | 'desc' }
            : sort === 'createdAt'
              ? { createdAt: order as 'asc' | 'desc' }
              : { lastName: order as 'asc' | 'desc' };

  const [items, total] = await Promise.all([
    prisma.internalStaff.findMany({ where, orderBy, skip, take: limit, select: staffSelect }),
    prisma.internalStaff.count({ where }),
  ]);
  res.json({ items, total, page, limit, pages: Math.ceil(total / limit) || 1 });
});

router.post('/', requireRole(...STAFF_ROLES), async (req, res) => {
  const { firstName, lastName } = req.body;
  if (!firstName?.trim() || !lastName?.trim()) {
    return res.status(400).json({ message: 'Prénom et nom requis' });
  }
  const data: Record<string, unknown> = {
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    reference: await nextReference('COL'),
  };
  applyStaffFields(data, req.body);
  const staff = await prisma.internalStaff.create({ data: data as never, select: staffSelect });
  await audit(req, 'création', 'InternalStaff', staff.id, `${staff.firstName} ${staff.lastName}`);
  res.status(201).json(staff);
});

router.get('/:id/salary-records', requireRole(...STAFF_ROLES), async (req, res) => {
  const staffId = String(req.params.id);
  const staff = await prisma.internalStaff.findUnique({ where: { id: staffId }, select: { id: true } });
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });
  const records = await prisma.internalStaffSalaryRecord.findMany({
    where: { staffId },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    take: 24,
  });
  res.json(records);
});

router.post('/:id/salary-records', requireRole(...STAFF_ROLES), async (req, res) => {
  const staffId = String(req.params.id);
  const staff = await prisma.internalStaff.findUnique({ where: { id: staffId } });
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });
  const periodYear = Number(req.body.periodYear) || new Date().getFullYear();
  const periodMonth = Number(req.body.periodMonth) || new Date().getMonth() + 1;
  const periodWeek = Number(req.body.periodWeek) || 0;
  const salaryPeriod = normalizeSalaryPeriod(req.body.salaryPeriod ?? staff.salaryPeriod);
  const defaultBase = baseSalaryForPeriod(staff.monthlySalary, salaryPeriod);
  const baseSalary = req.body.baseSalary != null ? Number(req.body.baseSalary) : defaultBase;
  const bonus = Number(req.body.bonus) || 0;
  const deduction = Number(req.body.deduction) || 0;
  const advance = Number(req.body.advance) || 0;
  const { net } = computeStaffNet(baseSalary, bonus, deduction, advance);
  const status = String(req.body.status || 'brouillon');
  const record = await prisma.internalStaffSalaryRecord.upsert({
    where: {
      staffId_periodYear_periodMonth_periodWeek: { staffId, periodYear, periodMonth, periodWeek },
    },
    create: {
      staffId,
      periodYear,
      periodMonth,
      periodWeek,
      salaryPeriod,
      baseSalary,
      bonus,
      deduction,
      advance,
      netSalary: net,
      status,
      remark: req.body.remark ? String(req.body.remark) : null,
      paidAt: status === 'payé' ? new Date() : null,
    },
    update: {
      salaryPeriod,
      baseSalary,
      bonus,
      deduction,
      advance,
      netSalary: net,
      ...(req.body.status != null ? { status } : {}),
      ...(req.body.remark !== undefined ? { remark: req.body.remark ? String(req.body.remark) : null } : {}),
      ...(status === 'payé' ? { paidAt: new Date() } : {}),
    },
    include: { staff: { select: { firstName: true, lastName: true } } },
  });
  await syncStaffSalaryMovement(record, req);
  await audit(req, 'paie', 'InternalStaff', staffId, `${staff.firstName} ${staff.lastName} — ${periodMonth}/${periodYear}`);
  res.json(record);
});

router.get('/:id/documents', requireRole(...STAFF_ROLES), async (req, res) => {
  const staffId = String(req.params.id);
  const staff = await prisma.internalStaff.findUnique({ where: { id: staffId }, select: { id: true } });
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });
  const [uploaded, generated] = await Promise.all([
    prisma.document.findMany({
      where: { entityType: 'InternalStaff', entityId: staffId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.internalStaffDocument.findMany({ where: { staffId }, orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({ uploaded, generated });
});

router.post('/:id/documents', requireRole(...STAFF_ROLES), upload.single('file'), async (req, res) => {
  const staffId = String(req.params.id);
  const staff = await prisma.internalStaff.findUnique({ where: { id: staffId }, select: { id: true } });
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const doc = await prisma.document.create({
    data: {
      name: req.body.name || req.file.originalname,
      category: req.body.category || 'RH',
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      entityType: 'InternalStaff',
      entityId: staffId,
    },
  });
  await audit(req, 'upload', 'InternalStaff', staffId, doc.name);
  res.status(201).json(doc);
});

router.post('/:id/photo', requireRole(...STAFF_ROLES), upload.single('file'), async (req, res) => {
  const staffId = String(req.params.id);
  if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return res.status(400).json({ message: 'Format photo : JPG, PNG ou WebP' });
  }
  const photo = `/uploads/${req.file.filename}`;
  const staff = await prisma.internalStaff.update({
    where: { id: staffId },
    data: { photo },
    select: staffSelect,
  });
  await audit(req, 'photo', 'InternalStaff', staff.id);
  res.json(staff);
});

router.get('/:id/print/:docType', requireRole(...STAFF_ROLES), async (req, res) => {
  const staffId = String(req.params.id);
  const docType = String(req.params.docType);
  const staff = await prisma.internalStaff.findUnique({
    where: { id: staffId },
    include: { user: { select: { email: true } } },
  });
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });

  const periodYear = Number(req.query.periodYear) || new Date().getFullYear();
  const periodMonth = Number(req.query.periodMonth) || new Date().getMonth() + 1;
  const record = await prisma.internalStaffSalaryRecord.findUnique({
    where: {
      staffId_periodYear_periodMonth_periodWeek: {
        staffId,
        periodYear,
        periodMonth,
        periodWeek: Number(req.query.periodWeek) || 0,
      },
    },
  });
  const salaryFallback = computeStaffNet(staff.monthlySalary);
  const html = staffDocHtml(docType, {
    reference: staff.reference,
    firstName: staff.firstName,
    lastName: staff.lastName,
    email: staff.email || staff.user?.email,
    cin: staff.cin,
    jobTitle: staff.jobTitle,
    department: staff.department,
    contractType: staff.contractType,
    monthlySalary: staff.monthlySalary,
    declared: staff.declared,
    cnssNumber: staff.cnssNumber,
    hireDate: staff.hireDate ? staff.hireDate.toISOString().slice(0, 10) : undefined,
    bankAccount: staff.rib || staff.bankAccount,
    bankName: staff.bankName,
    rib: staff.rib || staff.bankAccount,
    periodLabel: monthLabel(periodYear, periodMonth),
    baseSalary: record?.baseSalary ?? staff.monthlySalary,
    bonus: record?.bonus ?? 0,
    deduction: record?.deduction ?? 0,
    advance: record?.advance ?? 0,
    net: record?.netSalary ?? salaryFallback.net,
    remark: record?.remark,
  });

  if (docType === 'fiche_paie' || docType === 'attestation') {
    await prisma.internalStaffDocument.create({
      data: {
        staffId,
        docType,
        reference: staff.reference,
        data: JSON.stringify({ periodYear, periodMonth, generatedAt: new Date().toISOString() }),
      },
    });
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.get('/:id/history', requireRole(...STAFF_ROLES), async (req, res) => {
  const id = String(req.params.id);
  const logs = await prisma.auditLog.findMany({
    where: { entity: 'InternalStaff', entityId: id },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(logs);
});

router.post('/:id/link-user', requireRole(...ADMIN_ROLES), async (req, res) => {
  const staffId = String(req.params.id);
  const userId = String(req.body.userId || '');
  if (!userId) return res.status(400).json({ message: 'Utilisateur requis' });

  const [staff, user] = await Promise.all([
    prisma.internalStaff.findUnique({ where: { id: staffId } }),
    prisma.user.findUnique({ where: { id: userId }, include: { internalStaff: true } }),
  ]);
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
  if (user.internalStaff && user.internalStaff.id !== staffId) {
    return res.status(400).json({ message: 'Cet utilisateur est déjà lié à un autre collaborateur' });
  }

  const updated = await prisma.internalStaff.update({
    where: { id: staffId },
    data: { userId },
    select: staffSelect,
  });
  await audit(req, 'liaison', 'InternalStaff', staffId, user.email);
  res.json(updated);
});

router.delete('/:id/link-user', requireRole(...ADMIN_ROLES), async (req, res) => {
  const staffId = String(req.params.id);
  const staff = await prisma.internalStaff.findUnique({ where: { id: staffId } });
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });

  const updated = await prisma.internalStaff.update({
    where: { id: staffId },
    data: { userId: null },
    select: staffSelect,
  });
  await audit(req, 'déliaison', 'InternalStaff', staffId);
  res.json(updated);
});

router.post('/:id/create-user', requireRole(...ADMIN_ROLES), async (req, res) => {
  const staffId = String(req.params.id);
  const { email, password, role } = req.body;
  if (!email?.trim() || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis' });
  }

  const staff = await prisma.internalStaff.findUnique({ where: { id: staffId } });
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });
  if (staff.userId) return res.status(400).json({ message: 'Un compte est déjà lié' });

  const roleVal = USER_ROLES.includes(role) ? role : 'USER';
  if (roleVal === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ message: 'Seul un super administrateur peut créer ce rôle' });
  }

  const existing = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });
  if (existing) return res.status(400).json({ message: 'Email déjà utilisé' });

  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = await prisma.user.create({
    data: {
      email: String(email).trim().toLowerCase(),
      passwordHash,
      firstName: staff.firstName,
      lastName: staff.lastName,
      role: roleVal,
    },
  });

  const updated = await prisma.internalStaff.update({
    where: { id: staffId },
    data: { userId: user.id },
    select: staffSelect,
  });
  await audit(req, 'création', 'User', user.id, user.email);
  await audit(req, 'liaison', 'InternalStaff', staffId, user.email);
  res.status(201).json(updated);
});

router.get('/:id', requireRole(...STAFF_ROLES), async (req, res) => {
  const id = String(req.params.id);
  const staff = await prisma.internalStaff.findUnique({
    where: { id },
    select: {
      ...staffSelect,
      _count: { select: { salaryRecords: true, documents: true } },
    },
  });
  if (!staff) return res.status(404).json({ message: 'Collaborateur introuvable' });
  res.json(staff);
});

router.put('/:id', requireRole(...STAFF_ROLES), async (req, res) => {
  const id = String(req.params.id);
  const target = await prisma.internalStaff.findUnique({ where: { id } });
  if (!target) return res.status(404).json({ message: 'Collaborateur introuvable' });

  const data: Record<string, unknown> = {};
  applyStaffFields(data, req.body);
  if (!target.reference) data.reference = await nextReference('COL');

  const staff = await prisma.internalStaff.update({
    where: { id },
    data: data as never,
    select: staffSelect,
  });
  await audit(req, 'modification', 'InternalStaff', staff.id, `${staff.firstName} ${staff.lastName}`);
  res.json(staff);
});

export default router;
