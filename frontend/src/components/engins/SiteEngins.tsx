import { useState, type ReactNode } from 'react';
import type { CostBucket, CostLine } from '../../lib/engins';
import { AssignmentsPanel } from './Assignments';

export type SiteEnginCosts = {
  total: number;
  totals: CostBucket;
  byEngin?: (CostBucket & { enginId: string; enginLabel: string; days: number; hours: number })[];
  byTranche?: (CostBucket & { chantierId: string; chantierName: string; tranche: string })[];
  lines?: CostLine[];
};

/** Onglet chantier / tranche : seulement les engins affectés et une nouvelle affectation. */
export function SiteEnginsPanel({
  chantierId,
  tranche,
  onChanged,
}: {
  chantierId: string;
  tranche?: string;
  costs?: SiteEnginCosts | null;
  onChanged?: () => void;
  missions?: ReactNode;
  missionsCount?: number;
}) {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="mt-2">
      <AssignmentsPanel
        site
        initialStatus="actifs"
        fixed={{ chantierId, tranche }}
        defaults={{ chantierId, tranche: tranche || '' }}
        lock={{ chantier: true, tranche: !!tranche }}
        reloadKey={reloadKey}
        onChanged={() => { setReloadKey((k) => k + 1); onChanged?.(); }}
      />
    </div>
  );
}
