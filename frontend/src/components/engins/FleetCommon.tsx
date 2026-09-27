import { useEffect, useState, type ReactNode } from 'react';
import { api, fetchChantierList, fetchEnginList, fetchWorkforceList, formatMad } from '../../lib/api';
import {
  COST_CATEGORIES,
  fleetStatusClass,
  fleetStatusLabel,
  type ChantierRef,
  type CostBucket,
  type EnginRef,
  type TrancheRef,
} from '../../lib/engins';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Modal, Select, Textarea } from '../ui';

export function FleetStatusPill({ status }: { status?: string | null }) {
  const { t } = useI18n();
  return <span className={fleetStatusClass(status === 'en_mission' ? 'en_utilisation' : status)}>{fleetStatusLabel(status, t)}</span>;
}

let enginCache: Promise<EnginRef[]> | null = null;
let chantierCache: Promise<ChantierRef[]> | null = null;
let cachedAt = 0;
const CACHE_TTL = 30_000;

export function invalidateFleetRefs() {
  enginCache = null;
}

/** Listes de référence partagées (engins, chantiers), mises en cache 30 s entre les écrans. */
export function useFleetRefs() {
  const [engins, setEngins] = useState<EnginRef[]>([]);
  const [chantiers, setChantiers] = useState<ChantierRef[]>([]);
  useEffect(() => {
    if (Date.now() - cachedAt > CACHE_TTL) {
      enginCache = null;
      chantierCache = null;
      cachedAt = Date.now();
    }
    enginCache = enginCache || fetchEnginList<EnginRef>().catch(() => []);
    chantierCache = chantierCache || fetchChantierList<ChantierRef>().catch(() => []);
    enginCache.then(setEngins);
    chantierCache.then(setChantiers);
  }, []);
  return { engins, chantiers };
}

export function useTranches(chantierId?: string | null) {
  const [tranches, setTranches] = useState<TrancheRef[]>([]);
  useEffect(() => {
    if (!chantierId) {
      setTranches([]);
      return;
    }
    let alive = true;
    api<TrancheRef[]>(`/chantiers/${chantierId}/tranches`)
      .then((rows) => alive && setTranches(rows))
      .catch(() => alive && setTranches([]));
    return () => {
      alive = false;
    };
  }, [chantierId]);
  return tranches;
}

export function useDrivers() {
  const [drivers, setDrivers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  useEffect(() => {
    fetchWorkforceList<{ id: string; firstName: string; lastName: string }>().then(setDrivers).catch(() => setDrivers([]));
  }, []);
  return drivers;
}

export function EnginSelect({
  value,
  onChange,
  engins,
  disabled,
  required = true,
  label,
  filter,
}: {
  value: string;
  onChange: (id: string) => void;
  engins: EnginRef[];
  disabled?: boolean;
  required?: boolean;
  label?: string;
  filter?: (e: EnginRef) => boolean;
}) {
  const { t } = useI18n();
  const list = filter ? engins.filter((e) => filter(e) || e.id === value) : engins;
  return (
    <Select label={label ?? `${t('fleet.fields.engin')} *`} required={required} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {list.map((e) => (
        <option key={e.id} value={e.id}>
          {[e.code, e.designation || [e.genre, e.brand].filter(Boolean).join(' '), e.matricule].filter(Boolean).join(' — ')}
          {e.status !== 'disponible' ? ` (${fleetStatusLabel(e.status, t)})` : ''}
        </option>
      ))}
    </Select>
  );
}

export function ChantierTrancheFields({
  chantierId,
  tranche,
  onChange,
  chantiers,
  lockChantier,
  lockTranche,
  required,
}: {
  chantierId: string;
  tranche: string;
  onChange: (next: { chantierId: string; tranche: string }) => void;
  chantiers: ChantierRef[];
  lockChantier?: boolean;
  lockTranche?: boolean;
  required?: boolean;
}) {
  const { t } = useI18n();
  const tranches = useTranches(chantierId);
  return (
    <>
      <Select
        label={`${t('fleet.fields.chantier')}${required ? ' *' : ''}`}
        required={required}
        disabled={lockChantier}
        value={chantierId}
        onChange={(e) => onChange({ chantierId: e.target.value, tranche: '' })}
      >
        <option value="">—</option>
        {chantiers.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>
      <Select
        label={t('fleet.fields.tranche')}
        disabled={lockTranche || !chantierId}
        value={tranche}
        onChange={(e) => onChange({ chantierId, tranche: e.target.value })}
      >
        <option value="">{chantierId ? t('fleet.hints.wholeChantier') : '—'}</option>
        {tranches.map((tr) => (
          <option key={tr.id} value={tr.name}>{tr.name}</option>
        ))}
        {tranche && !tranches.some((tr) => tr.name === tranche) && <option value={tranche}>{tranche}</option>}
      </Select>
    </>
  );
}

export type AllocationValue = { allocation: 'direct' | 'reparti'; chantierId: string; tranche: string };

export function AllocationFields({
  value,
  onChange,
  chantiers,
}: {
  value: AllocationValue;
  onChange: (v: AllocationValue) => void;
  chantiers: ChantierRef[];
}) {
  const { t } = useI18n();
  return (
    <div className="sm:col-span-2 rounded-lg border border-black/[0.06] bg-black/[0.015] p-3 space-y-3">
      <p className="text-[11px] font-semibold text-gic-muted uppercase tracking-wide">{t('fleet.fields.allocation')}</p>
      <div className="flex flex-col gap-1.5">
        {(['reparti', 'direct'] as const).map((a) => (
          <label key={a} className="flex items-start gap-2 text-[12px] cursor-pointer">
            <input
              type="radio"
              className="mt-0.5"
              checked={value.allocation === a}
              onChange={() => onChange({ ...value, allocation: a, ...(a === 'reparti' ? { chantierId: '', tranche: '' } : {}) })}
            />
            <span>
              {t(`fleet.allocation.${a}`)}
              <span className="block text-[10px] text-gic-muted">{t(`fleet.allocationHint.${a}`)}</span>
            </span>
          </label>
        ))}
      </div>
      {value.allocation === 'direct' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ChantierTrancheFields
            required
            chantierId={value.chantierId}
            tranche={value.tranche}
            chantiers={chantiers}
            onChange={(n) => onChange({ ...value, ...n })}
          />
        </div>
      )}
    </div>
  );
}

export function DeleteMotifModal({
  open,
  title,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: (motif: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setMotif('');
  }, [open]);
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn
            variant="danger"
            disabled={!motif.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(motif.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('common.delete')}
          </Btn>
        </>
      }
    >
      <Textarea label={t('msg.motifStar')} value={motif} onChange={(e) => setMotif(e.target.value)} />
    </Modal>
  );
}

/** Pastilles de coûts par catégorie (amortissement, location, entretien, réparation, carburant, autres, total). */
export function CostChips({ bucket, compact = false }: { bucket?: Partial<CostBucket> | null; compact?: boolean }) {
  const { t } = useI18n();
  if (!bucket) return null;
  return (
    <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7'}`}>
      {COST_CATEGORIES.map((c) => (
        <div key={c} className="rounded-lg border border-black/[0.06] bg-white px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gic-muted">{t(`fleet.costCat.${c}`)}</p>
          <p className="text-[13px] font-semibold tabular-nums">{formatMad(bucket[c] || 0)}</p>
        </div>
      ))}
      <div className="rounded-lg border border-gic-violet/30 bg-gic-violet-soft px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-gic-violet">{t('fleet.costCat.total')}</p>
        <p className="text-[13px] font-bold tabular-nums text-gic-violet">{formatMad(bucket.total || 0)}</p>
      </div>
    </div>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sm:col-span-2 pt-2">
      <p className="text-[11px] font-semibold text-gic-muted uppercase tracking-wide mb-2 border-b border-black/[0.06] pb-1">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-black/[0.04] last:border-0">
      <span className="text-[11px] text-gic-muted">{label}</span>
      <span className="text-[12px] font-medium text-right">{value ?? '—'}</span>
    </div>
  );
}
