import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, SlidersHorizontal } from 'lucide-react';
import { api } from '../../lib/api';
import { appAlert } from '../../lib/dialog';
import { errorMessage, queryString, todayISO, type Assignment } from '../../lib/engins';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, MacSearch, Select } from '../ui';

type ChantierOption = { id: string; name: string };
type PlaceFilter = 'all' | 'whole' | string;

type MaterielRow = {
  enginId: string;
  code?: string | null;
  designation?: string | null;
  chantierId?: string;
  chantierName?: string;
  tranche?: string | null;
  quantity: number;
};

function placeOf(filter: PlaceFilter) {
  if (filter === 'all' || filter === 'whole') return '';
  return filter;
}

function matchPlace(tranche: string | null | undefined, filter: PlaceFilter) {
  if (filter === 'all') return true;
  if (filter === 'whole') return !tranche;
  return (tranche || '') === filter;
}

function rowKey(enginId: string, tranche?: string | null) {
  return `${enginId}::${tranche || ''}`;
}

export function SiteTransferPanel({
  kind,
  chantierId,
  tranche,
  onChanged,
}: {
  kind: 'engin' | 'materiel';
  chantierId: string;
  tranche?: string;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [chantiers, setChantiers] = useState<ChantierOption[]>([]);
  const [sourceRows, setSourceRows] = useState<Assignment[] | MaterielRow[]>([]);
  const [destRows, setDestRows] = useState<Assignment[] | MaterielRow[]>([]);
  const [sourceTranches, setSourceTranches] = useState<string[]>([]);
  const [destTranches, setDestTranches] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<PlaceFilter>(tranche || 'all');
  const [destFilter, setDestFilter] = useState<PlaceFilter>('all');
  const [destId, setDestId] = useState('');
  const [query, setQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [selectedLeft, setSelectedLeft] = useState<string[]>([]);
  const [selectedRight, setSelectedRight] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api<{ items: ChantierOption[] }>('/chantiers?limit=100&sort=name&order=asc')
      .then((r) => setChantiers(r.items || []))
      .catch(() => setChantiers([]));
    api<{ name: string }[]>(`/chantiers/${chantierId}/tranches`)
      .then((rows) => setSourceTranches(rows.map((row) => row.name)))
      .catch(() => setSourceTranches([]));
  }, [chantierId]);

  useEffect(() => {
    if (!destId) { setDestTranches([]); setDestRows([]); return; }
    api<{ name: string }[]>(`/chantiers/${destId}/tranches`)
      .then((rows) => setDestTranches(rows.map((row) => row.name)))
      .catch(() => setDestTranches([]));
  }, [destId]);

  useEffect(() => {
    if (kind === 'engin') {
      api<{ items: Assignment[] }>(`/engins/assignments?${queryString({ chantierId, status: 'actifs', kind: 'engin' })}`)
        .then((data) => setSourceRows(data.items || []))
        .catch(() => setSourceRows([]));
    } else {
      api<{ rows: MaterielRow[] }>(`/engins/materiel/positions?chantierId=${chantierId}`)
        .then((data) => setSourceRows(data.rows || []))
        .catch(() => setSourceRows([]));
    }
  }, [kind, chantierId, reload]);

  useEffect(() => {
    if (!destId) return;
    if (kind === 'engin') {
      api<{ items: Assignment[] }>(`/engins/assignments?${queryString({ chantierId: destId, status: 'actifs', kind: 'engin' })}`)
        .then((data) => setDestRows(data.items || []))
        .catch(() => setDestRows([]));
    } else {
      api<{ rows: MaterielRow[] }>(`/engins/materiel/positions?chantierId=${destId}`)
        .then((data) => setDestRows(data.rows || []))
        .catch(() => setDestRows([]));
    }
  }, [kind, destId, reload]);

  const left = useMemo(() => filterRows(sourceRows, sourceFilter, query, kind), [sourceRows, sourceFilter, query, kind]);
  const right = useMemo(() => filterRows(destRows, destFilter, destQuery, kind), [destRows, destFilter, destQuery, kind]);
  const otherSites = chantiers.filter((c) => c.id !== chantierId);

  function toggle(list: string[], id: string, setList: (ids: string[]) => void) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function qtyOf(row: MaterielRow) {
    const key = rowKey(row.enginId, row.tranche);
    const raw = qty[key];
    const n = raw === undefined ? row.quantity : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : row.quantity;
  }

  async function move(direction: 'out' | 'in') {
    if (!destId || saving) return;
    const fromId = direction === 'out' ? chantierId : destId;
    const toId = direction === 'out' ? destId : chantierId;
    const destPlace = placeOf(direction === 'out' ? destFilter : sourceFilter);
    const picked = direction === 'out' ? selectedLeft : selectedRight;
    const pool = direction === 'out' ? sourceRows : destRows;
    if (!picked.length) return;
    if (fromId === toId && (destPlace || '') === (direction === 'out' ? placeOf(sourceFilter) : placeOf(destFilter)) && destFilter !== 'all' && sourceFilter !== 'all') {
      await appAlert(t('siteOps.transferSamePlace'));
      return;
    }
    setSaving(true);
    const failed: string[] = [];
    let ok = 0;
    for (const id of picked) {
      try {
        if (kind === 'engin') {
          const row = (pool as Assignment[]).find((a) => a.id === id);
          if (!row) continue;
          await api(`/engins/assignments/${row.id}/transfer`, {
            method: 'POST',
            body: JSON.stringify({ chantierId: toId, tranche: destPlace || null }),
          });
        } else {
          const row = (pool as MaterielRow[]).find((r) => rowKey(r.enginId, r.tranche) === id);
          if (!row) continue;
          const quantity = qtyOf(row);
          if (quantity > row.quantity + 0.001) throw new Error(t('fleet.stock.empty'));
          await api(`/engins/${row.enginId}/mouvements`, {
            method: 'POST',
            body: JSON.stringify({
              movementType: 'transfert',
              quantity,
              date: todayISO(),
              fromChantierId: fromId,
              fromTranche: row.tranche || null,
              chantierId: toId,
              tranche: destPlace || null,
            }),
          });
        }
        ok += 1;
      } catch (err) {
        const label = kind === 'engin'
          ? (pool as Assignment[]).find((a) => a.id === id)?.enginLabel || id
          : (pool as MaterielRow[]).find((r) => rowKey(r.enginId, r.tranche) === id)?.designation || id;
        failed.push(`${label} — ${errorMessage(err, t('common.error'))}`);
      }
    }
    setSelectedLeft([]);
    setSelectedRight([]);
    setReload((n) => n + 1);
    onChanged?.();
    setSaving(false);
    if (failed.length) await appAlert(failed.join('\n'));
    else if (ok) await appAlert(t(kind === 'engin' ? 'siteOps.transferEnginDone' : 'siteOps.transferMaterielDone', { count: ok }));
  }

  return (
    <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <TransferColumn
        tone="blue"
        title={t('siteOps.transferHere')}
        kind={kind}
        count={left.length}
        query={query}
        onQuery={setQuery}
        filter={sourceFilter}
        onFilter={setSourceFilter}
        tranches={sourceTranches}
        rows={left}
        selected={selectedLeft}
        qty={qty}
        onQty={setQty}
        onToggle={(id) => toggle(selectedLeft, id, setSelectedLeft)}
        empty={t(kind === 'engin' ? 'siteOps.transferNoneEngin' : 'siteOps.transferNoneMateriel')}
      />
      <div className="flex lg:flex-col items-center justify-center gap-2">
        <Btn icon={ArrowRight} title={t('siteOps.transferOut')} disabled={!destId || !selectedLeft.length || saving} onClick={() => move('out')}>
          {t('siteOps.transferOut')}
        </Btn>
        <Btn className="!bg-[#248a3d] hover:!bg-[#1f7a34]" icon={ArrowLeft} title={t('siteOps.transferIn')} disabled={!destId || !selectedRight.length || saving} onClick={() => move('in')}>
          {t('siteOps.transferIn')}
        </Btn>
      </div>
      <div className="mac-section-card !p-0 overflow-visible flex flex-col min-h-[380px] !border-[#248a3d]/25">
        <div className="px-3 py-3 bg-[#e9f8ee] border-b border-black/[0.06]">
          <p className="text-[13px] font-semibold text-gic-ink">{t('siteOps.transferThere')}</p>
          <div className="mt-2">
            <Select value={destId} onChange={(e) => { setDestId(e.target.value); setDestFilter('all'); setSelectedRight([]); }}>
              <option value="">{t('msg.chooseSite')}</option>
              <option value={chantierId}>{t('siteOps.thisSite')}</option>
              {otherSites.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
        {destId ? (
          <TransferColumn
            embedded
            tone="green"
            title=""
            kind={kind}
            count={right.length}
            query={destQuery}
            onQuery={setDestQuery}
            filter={destFilter}
            onFilter={setDestFilter}
            tranches={destTranches}
            rows={right}
            selected={selectedRight}
            qty={qty}
            onQty={setQty}
            onToggle={(id) => toggle(selectedRight, id, setSelectedRight)}
            empty={t(kind === 'engin' ? 'siteOps.transferNoneEngin' : 'siteOps.transferNoneMateriel')}
          />
        ) : (
          <p className="px-3 py-8 text-center text-[12px] text-gic-muted">{t('msg.chooseSite')}</p>
        )}
      </div>
    </div>
  );
}

function filterRows(rows: Assignment[] | MaterielRow[], filter: PlaceFilter, query: string, kind: 'engin' | 'materiel') {
  const needle = query.trim().toLowerCase();
  if (kind === 'engin') {
    return (rows as Assignment[]).filter((row) => {
      if (!matchPlace(row.tranche, filter)) return false;
      if (needle && !`${row.enginLabel} ${row.responsible || ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }
  return (rows as MaterielRow[]).filter((row) => {
    if (!matchPlace(row.tranche, filter)) return false;
    if (needle && !`${row.designation || ''} ${row.code || ''}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

function TransferColumn({
  title, count, query, onQuery, filter, onFilter, tranches, rows, selected, onToggle, empty, embedded, tone, kind, qty, onQty,
}: {
  title: string;
  count: number;
  query: string;
  onQuery: (v: string) => void;
  filter: PlaceFilter;
  onFilter: (v: PlaceFilter) => void;
  tranches: string[];
  rows: Assignment[] | MaterielRow[];
  selected: string[];
  onToggle: (id: string) => void;
  empty: string;
  embedded?: boolean;
  tone: 'blue' | 'green';
  kind: 'engin' | 'materiel';
  qty: Record<string, string>;
  onQty: (next: Record<string, string>) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const chip = tone === 'green' ? 'mac-chip-green' : 'mac-chip-blue';
  const head = tone === 'green' ? 'bg-[#e9f8ee]' : 'bg-[#e8f2ff]';
  const picked = tone === 'green' ? 'bg-[#e9f8ee]' : 'bg-[#e8f2ff]';
  const mark = tone === 'green' ? 'bg-[#248a3d] border-[#248a3d]' : 'bg-[#007aff] border-[#007aff]';

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const options: { id: PlaceFilter; label: string }[] = [
    { id: 'all', label: t('common.all') },
    { id: 'whole', label: t('msg.wholeSite') },
    ...tranches.map((name) => ({ id: name, label: name })),
  ];

  const body = (
    <>
      <div className={`${head} ${embedded ? 'px-3 pb-3' : 'px-3 py-3'} border-b border-black/[0.06]`}>
        {!embedded && (
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[13px] font-semibold text-gic-ink">{title}</p>
            <span className={`mac-chip ${chip}`}>{count}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <MacSearch value={query} onChange={onQuery} placeholder={t('common.searchEllipsis')} />
          </div>
          <div ref={menuRef} className="relative shrink-0">
            <Btn
              variant="secondary"
              icon={SlidersHorizontal}
              title={t('common.filters')}
              aria-label={t('common.filters')}
              className={`!px-2 !py-2 relative${filter !== 'all' ? ' ring-1 ring-[#007aff]/40' : ''}`}
              onClick={() => setOpen((v) => !v)}
            >
              {filter !== 'all' && <span className="mac-filter-dot" aria-hidden />}
            </Btn>
            {open && (
              <div className="mac-filter-menu" role="menu">
                <p className="mac-filter-menu-section">{t('columns.tranche')}</p>
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    className={`mac-filter-menu-item${filter === option.id ? ' mac-filter-menu-item-active' : ''}`}
                    onClick={() => { onFilter(option.id); setOpen(false); }}
                  >
                    <span>{option.label}</span>
                    {filter === option.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gic-muted">{t('siteOps.transferArrive', { place: placeOf(filter) || t('msg.wholeSite') })}</p>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-gic-muted">{empty}</p>
        ) : kind === 'engin' ? (
          (rows as Assignment[]).map((row) => {
            const on = selected.includes(row.id);
            return (
              <button
                key={row.id}
                type="button"
                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${on ? picked : 'hover:bg-black/[0.03]'}`}
                onClick={() => onToggle(row.id)}
              >
                <span className={`h-4 w-4 shrink-0 rounded border ${on ? `${mark} text-white` : 'border-black/20'}`}>{on ? <Check size={12} /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-gic-ink">{row.enginLabel}</span>
                  <span className="block text-[11px] text-gic-muted">{row.tranche || t('msg.wholeSite')}</span>
                </span>
              </button>
            );
          })
        ) : (
          (rows as MaterielRow[]).map((row) => {
            const id = rowKey(row.enginId, row.tranche);
            const on = selected.includes(id);
            return (
              <div key={id} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 ${on ? picked : ''}`}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onToggle(id)}>
                  <span className={`h-4 w-4 shrink-0 rounded border ${on ? `${mark} text-white` : 'border-black/20'}`}>{on ? <Check size={12} /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-gic-ink">{row.designation || row.code}</span>
                    <span className="block text-[11px] text-gic-muted">{row.tranche || t('msg.wholeSite')} · {row.quantity}</span>
                  </span>
                </button>
                {on && (
                  <input
                    className="w-20 rounded-md border border-black/[0.1] bg-white px-2 py-1 text-[12px] outline-none"
                    type="number"
                    min="0.01"
                    max={row.quantity}
                    step="1"
                    value={qty[id] ?? String(row.quantity)}
                    onChange={(e) => onQty({ ...qty, [id]: e.target.value })}
                    aria-label={t('fleet.fields.quantity')}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );

  if (embedded) return body;
  return <div className="mac-section-card !p-0 overflow-visible flex flex-col min-h-[380px]">{body}</div>;
}
