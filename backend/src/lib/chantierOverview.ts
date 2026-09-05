type PurchaseRow = { id: string; reference: string; designation: string; totalPrice: number; status: string; date: Date; updatedAt: Date };
type ProgressRow = { id: string; tranche: string | null; groupe: string | null; etage: string | null; taskName: string; percent: number; updatedAt: Date };
type AssignmentRow = { id: string; workforce: { firstName: string; lastName: string } };
type DocumentRow = { id: string; name: string; expiresAt?: Date | null };
type HistoryRow = { id: string; action: string; details: string | null; createdAt: Date; user?: { firstName: string; lastName: string } | null };

const FINISHING_TASKS = ['Carrelage', 'Peinture', 'Finitions', 'Ménage', 'Enduit intérieur', 'Enduit extérieur'];

export function buildChantierOverview(chantier: {
  id: string;
  budgetAchats?: number | null;
  workerCount: number;
  progressPct: number;
  purchases?: PurchaseRow[];
  progress?: ProgressRow[];
  assignments?: AssignmentRow[];
  documents?: DocumentRow[];
  history?: HistoryRow[];
  pointageToday?: number;
  pointageValidatedToday?: number;
  costMO?: number;
  cnssNonDeclare?: number;
}) {
  const purchases = chantier.purchases || [];
  const progress = chantier.progress || [];
  const assignments = chantier.assignments || [];
  const documents = chantier.documents || [];

  const depense = purchases
    .filter((p) => !['brouillon', 'retourné'].includes(p.status))
    .reduce((s, p) => s + Number(p.totalPrice || 0), 0);
  const estimatedBudget = Math.round(depense * 1.55) || 0;
  const budgetAchats = chantier.budgetAchats != null ? Number(chantier.budgetAchats) : estimatedBudget;
  const achatsOuverts = purchases.filter((p) => ['brouillon', 'retourné'].includes(p.status)).length;

  // Structure Tranche → Groupe → étages
  const trancheMap = new Map<string, Map<string, { percents: number[]; etages: Set<string> }>>();
  for (const p of progress) {
    const tranche = p.tranche || 'Tranche 1';
    const groupe = p.groupe || 'Ensemble';
    if (!trancheMap.has(tranche)) trancheMap.set(tranche, new Map());
    const gMap = trancheMap.get(tranche)!;
    if (!gMap.has(groupe)) gMap.set(groupe, { percents: [], etages: new Set() });
    const g = gMap.get(groupe)!;
    g.percents.push(p.percent);
    if (p.etage) g.etages.add(p.etage);
  }

  const structure = [...trancheMap.entries()].map(([tranche, groupes]) => {
    const groupList = [...groupes.entries()].map(([name, data]) => ({
      name,
      percent: Math.round(data.percents.reduce((a, b) => a + b, 0) / Math.max(1, data.percents.length)),
      etages: [...data.etages].sort(),
    }));
    const allP = groupList.flatMap((g) => [g.percent]);
    return {
      tranche,
      percent: allP.length ? Math.round(allP.reduce((a, b) => a + b, 0) / allP.length) : 0,
      groupes: groupList,
    };
  });

  // Barres par lot (moyenne par nom de tâche)
  const taskMap = new Map<string, number[]>();
  for (const p of progress) {
    if (!taskMap.has(p.taskName)) taskMap.set(p.taskName, []);
    taskMap.get(p.taskName)!.push(p.percent);
  }
  const taskBars = [...taskMap.entries()]
    .map(([taskName, percents]) => {
      const percent = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
      let tone: 'done' | 'progress' | 'late' = 'progress';
      if (percent >= 90) tone = 'done';
      else if (percent < 40) tone = 'late';
      return { taskName, percent, tone };
    })
    .sort((a, b) => b.percent - a.percent);

  const done = taskBars.filter((t) => t.percent >= 90).length;
  const inProgress = taskBars.filter((t) => t.percent >= 40 && t.percent < 90).length;
  const late = taskBars.filter((t) => t.percent < 40).length;

  // Alertes
  const alerts: { tone: 'coral' | 'amber' | 'violet'; title: string; detail: string }[] = [];

  for (const t of taskBars.filter((x) => x.percent < 40).slice(0, 2)) {
    alerts.push({
      tone: 'coral',
      title: `Retard sur ${t.taskName}`,
      detail: `Avancement à ${t.percent}% — action requise`,
    });
  }
  for (const t of taskBars.filter((x) => FINISHING_TASKS.includes(x.taskName) && x.percent >= 20 && x.percent < 55).slice(0, 1)) {
    alerts.push({
      tone: 'amber',
      title: `${t.taskName} — approvisionnement`,
      detail: `Lot à ${t.percent}% — vérifier stock matériaux`,
    });
  }
  if (achatsOuverts > 0) {
    alerts.push({
      tone: 'amber',
      title: `${achatsOuverts} achat(s) à traiter`,
      detail: 'Commandes en brouillon ou retournées',
    });
  }
  const expiring = documents.filter((d) => {
    const exp = (d as { expiresAt?: Date | null }).expiresAt ?? null;
    if (!exp) return false;
    const days = (new Date(exp).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 30;
  });
  if (expiring.length) {
    alerts.push({
      tone: 'violet',
      title: `${expiring.length} document(s) à échéance`,
      detail: 'Expiration dans les 30 prochains jours',
    });
  }

  // Activité récente
  const activity: { date: Date; label: string; detail: string; tone?: string }[] = [];

  if (chantier.pointageValidatedToday != null && chantier.pointageValidatedToday > 0) {
    activity.push({
      date: new Date(),
      label: 'Pointage validé',
      detail: `${chantier.pointageValidatedToday} ouvrier(s) aujourd'hui`,
      tone: 'emerald',
    });
  }

  const recentProgress = [...progress].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 2);
  for (const p of recentProgress) {
    activity.push({
      date: p.updatedAt,
      label: 'Avancement mis à jour',
      detail: `${p.taskName} — ${Math.round(p.percent)}%`,
      tone: 'violet',
    });
  }

  const recentPurchases = [...purchases]
    .filter((p) => !['brouillon'].includes(p.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 2);
  for (const p of recentPurchases) {
    activity.push({
      date: p.updatedAt,
      label: 'Achat validé',
      detail: `${p.reference} — ${Math.round(p.totalPrice).toLocaleString('fr-MA')} MAD`,
      tone: 'coral',
    });
  }

  for (const h of (chantier.history || []).slice(0, 3)) {
    activity.push({
      date: h.createdAt,
      label: h.action,
      detail: h.details || (h.user ? `${h.user.firstName} ${h.user.lastName}` : '—'),
    });
  }

  activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    synthèse: {
      personnel: assignments.length,
      personnelDeclare: chantier.workerCount,
      budgetAchats,
      depense,
      achatsOuverts,
      alertes: alerts.length,
      costMO: Number(chantier.costMO || 0),
      cnssNonDeclare: Number(chantier.cnssNonDeclare || 0),
      budgetTotal: budgetAchats + Number(chantier.costMO || 0),
    },
    structure,
    taskBars,
    taskSummary: { done, inProgress, late, total: taskBars.length },
    alerts: alerts.slice(0, 4),
    activity: activity.slice(0, 6),
  };
}
