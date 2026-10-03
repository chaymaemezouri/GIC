import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Eye, Package, Plus, Undo2, Wallet, Warehouse } from 'lucide-react';
import { api, formatDate, formatMad } from '../../lib/api';
import { appAlert } from '../../lib/dialog';
import { COST_CATEGORIES, formatQty, parseIntQty, todayISO, type CostBucket, type CostLine } from '../../lib/engins';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, EmptyState, Input, KpiCard, MacActionBtn, MacDateInput, MacSearch, Modal, Select, TableWrap, Tabs, Td, Th } from '../ui';
import { MaterielStockPanel } from './MaterielStockPanel';
import { SiteTransferPanel } from './SiteTransferPanel';

type Position = {
  enginId: string;
  code?: string | null;
  designation?: string | null;
  chantierId?: string;
  chantierName?: string;
  tranche?: string | null;
  quantity: number;
  depot?: number;
  owned?: number;
  repair?: number;
};
type Catalog = {
  id: string;
  code?: string | null;
  designation?: string | null;
  depot: number;
  owned: number;
  repair: number;
  onSite: number;
};
type Move = {
  id: string;
  movementType: string;
  quantity: number;
  date: string;
  tranche?: string | null;
  fromTranche?: string | null;
  remark?: string | null;
  engin?: { id: string; code?: string | null; designation?: string | null };
  chantier?: { id: string; name: string } | null;
  fromChantier?: { id: string; name: string } | null;
};
type Chantier = { id: string; name: string };
type Section = 'affectation' | 'transfer' | 'retours' | 'synthese';
type ActionKind = 'assign' | 'return' | 'split' | 'transfer';
type CostsPayload = {
  totals: CostBucket;
  byEngin: (CostBucket & { enginId: string; enginLabel: string; enginKind: string; days: number; hours: number })[];
  lines: CostLine[];
};

function intField(raw: string) {
  const n = parseInt(String(raw).replace(',', '.'), 10);
  return Number.isFinite(n) && n > 0 ? String(n) : '';
}

function labelOf(row: { designation?: string | null; code?: string | null }) {
  return row.designation || row.code || '—';
}

function placeKey(tranche?: string | null) {
  return tranche || '';
}

export function SiteMaterielPanel({
  chantierId,
  tranche,
  onChanged,
}: {
  chantierId: string;
  tranche?: string;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('affectation');
  const [reload, setReload] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [tranches, setTranches] = useState<string[]>([]);
  const [destTranches, setDestTranches] = useState<string[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLabel, setDetailLabel] = useState('');
  const [action, setAction] = useState<ActionKind | null>(null);
  const [row, setRow] = useState<Position | null>(null);
  const [picked, setPicked] = useState('');
  const [qty, setQty] = useState('1');
  const [destTranche, setDestTranche] = useState(tranche || '');
  const [fromPlace, setFromPlace] = useState(tranche || '');
  const [destChantierId, setDestChantierId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [remark, setRemark] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [costs, setCosts] = useState<CostsPayload | null>(null);
  const [openEnginId, setOpenEnginId] = useState<string | null>(null);

  function bump() {
    setReload((n) => n + 1);
    onChanged?.();
  }

  useEffect(() => {
    const qs = new URLSearchParams({ chantierId });
    if (tranche) qs.set('tranche', tranche);
    api<{ rows: Position[]; movements: Move[]; catalog?: Catalog[] }>(`/engins/materiel/positions?${qs}`)
      .then((data) => {
        setPositions(data.rows || []);
        setHistory(data.movements || []);
        setCatalog(data.catalog || []);
      })
      .catch(() => {
        setPositions([]);
        setHistory([]);
        setCatalog([]);
      });
  }, [chantierId, tranche, reload]);

  useEffect(() => {
    api<{ name: string }[]>(`/chantiers/${chantierId}/tranches`)
      .then((rows) => setTranches((rows || []).map((r) => r.name)))
      .catch(() => setTranches([]));
    api<{ items: Chantier[] }>('/chantiers?limit=200&sort=name&order=asc')
      .then((data) => setChantiers((data.items || []).filter((c) => c.id !== chantierId)))
      .catch(() => setChantiers([]));
  }, [chantierId]);

  useEffect(() => {
    if (action !== 'transfer' || !destChantierId) {
      setDestTranches([]);
      return;
    }
    api<{ name: string }[]>(`/chantiers/${destChantierId}/tranches`)
      .then((rows) => setDestTranches((rows || []).map((r) => r.name)))
      .catch(() => setDestTranches([]));
  }, [destChantierId, action]);

  useEffect(() => {
    if (section !== 'synthese') return;
    const qs = new URLSearchParams({ chantierId, kind: 'materiel' });
    if (tranche) qs.set('tranche', tranche);
    api<CostsPayload>(`/engins/costs?${qs}`)
      .then(setCosts)
      .catch(() => setCosts(null));
  }, [section, chantierId, tranche, reload]);

  const pickedStock = catalog.find((item) => item.id === picked);
  const totalQty = positions.reduce((s, p) => s + p.quantity, 0);
  const articleCount = new Set(positions.map((p) => p.enginId)).size;
  const depotAvailable = catalog.reduce((s, item) => s + (item.depot || 0), 0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return positions;
    return positions.filter((p) => `${labelOf(p)} ${p.code || ''} ${p.tranche || ''}`.toLowerCase().includes(needle));
  }, [positions, query]);

  const filteredHistory = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return history;
    return history.filter((m) => `${m.engin?.designation || ''} ${m.movementType} ${m.remark || ''}`.toLowerCase().includes(needle));
  }, [history, query]);

  const synthesisRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (costs?.byEngin || []).filter((row) => {
      if (row.enginKind !== 'materiel') return false;
      if (needle && !row.enginLabel.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [costs, query]);
  const openEngin = costs?.byEngin.find((row) => row.enginId === openEnginId) || null;
  const openLines = useMemo(
    () => (costs?.lines || []).filter((line) => line.enginId === openEnginId),
    [costs, openEnginId],
  );

  function openAssign() {
    setAction('assign');
    setRow(null);
    setPicked('');
    setQty('1');
    setDestTranche(tranche || '');
    setDate(todayISO());
    setRemark('');
  }

  function openRow(kind: ActionKind, target: Position) {
    setAction(kind);
    setRow(target);
    setPicked(target.enginId);
    setQty(kind === 'return' || kind === 'transfer' || kind === 'split' ? String(target.quantity) : '1');
    setFromPlace(placeKey(target.tranche));
    setDestTranche(kind === 'split' ? (tranche || '') : kind === 'transfer' ? '' : (target.tranche || tranche || ''));
    setDestChantierId('');
    setDate(todayISO());
    setRemark('');
  }

  async function postMove(enginId: string, body: Record<string, unknown>) {
    await api(`/engins/${enginId}/mouvements`, { method: 'POST', body: JSON.stringify(body) });
  }

  async function saveAction() {
    if (!picked) return;
    const n = parseIntQty(qty);
    if (n == null) {
      await appAlert(t('fleet.stock.integerQty'));
      return;
    }
    setSaving(true);
    try {
      if (action === 'assign') {
        await postMove(picked, {
          movementType: 'affectation',
          quantity: n,
          date,
          remark: remark || null,
          chantierId,
          tranche: tranche || destTranche || null,
        });
      } else if (action === 'return' && row) {
        await postMove(row.enginId, {
          movementType: 'desaffectation',
          quantity: n,
          date,
          remark: remark || null,
          fromChantierId: chantierId,
          fromTranche: row.tranche || null,
        });
      } else if (action === 'split') {
        if (placeKey(fromPlace) === placeKey(destTranche)) {
          await appAlert(t('fleet.stock.samePlace'));
          return;
        }
        await postMove(picked, {
          movementType: 'transfert',
          quantity: n,
          date,
          remark: remark || null,
          fromChantierId: chantierId,
          fromTranche: fromPlace || null,
          chantierId,
          tranche: destTranche || null,
        });
      } else if (action === 'transfer') {
        if (!destChantierId) {
          await appAlert(t('common.error'));
          return;
        }
        await postMove(picked, {
          movementType: 'transfert',
          quantity: n,
          date,
          remark: remark || null,
          fromChantierId: chantierId,
          fromTranche: row?.tranche || fromPlace || null,
          chantierId: destChantierId,
          tranche: destTranche || null,
        });
      }
      setAction(null);
      setQty('1');
      setRemark('');
      bump();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function returnFromRow(target: Position) {
    const key = `${target.enginId}::${placeKey(target.tranche)}`;
    const n = parseIntQty(returnQty[key] ?? target.quantity);
    if (n == null) {
      await appAlert(t('fleet.stock.integerQty'));
      return;
    }
    setSaving(true);
    try {
      await postMove(target.enginId, {
        movementType: 'desaffectation',
        quantity: n,
        date,
        fromChantierId: chantierId,
        fromTranche: target.tranche || null,
      });
      bump();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  function moveSource(move: Move) {
    if (move.movementType === 'affectation') return t('fleet.stock.depot');
    if (move.movementType === 'desaffectation') return move.fromChantier?.name || move.chantier?.name || '—';
    if (move.movementType === 'transfert') return `${move.fromChantier?.name || '—'}${move.fromTranche ? ` · ${move.fromTranche}` : ''}`;
    if (move.movementType === 'sortie') return move.chantier?.name || t('fleet.stock.depot');
    if (move.movementType === 'maintenance') return move.fromChantier?.name || t('fleet.stock.depot');
    if (move.movementType === 'retour') return t('fleet.stock.repair');
    return '—';
  }

  function moveDest(move: Move) {
    if (move.movementType === 'desaffectation') return t('fleet.stock.depot');
    if (move.movementType === 'sortie') return '—';
    if (move.movementType === 'maintenance') return t('fleet.stock.repair');
    return `${move.chantier?.name || t('fleet.stock.depot')}${move.tranche ? ` · ${move.tranche}` : ''}`;
  }

  const actionTitle =
    action === 'assign' ? t('fleet.stock.assignCta')
    : action === 'return' ? t('fleet.stock.returnQty')
    : action === 'split' ? t('fleet.stock.changeTranche')
    : action === 'transfer' ? t('fleet.stock.transferTo')
    : '';

  const assignChoices = catalog;

  return (
    <div className="mt-2 space-y-4">
      <Tabs
        mac
        active={section}
        onChange={(id) => setSection(id as Section)}
        tabs={[
          { id: 'affectation', label: t('siteOps.affectation') },
          { id: 'transfer', label: t('siteOps.transfer') },
          { id: 'retours', label: t('fleet.nav.retours') },
          { id: 'synthese', label: t('siteOps.synthesis') },
        ]}
      />

      {section === 'affectation' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MacSearch value={query} onChange={setQuery} placeholder={t('fleet.stock.search')} className="w-56" />
            <Btn type="button" icon={Plus} onClick={openAssign}>{t('fleet.stock.assignCta')}</Btn>
          </div>
          <div className="mac-kpi-grid mac-kpi-grid-4">
            <KpiCard title={t('fleet.stock.articles')} value={String(articleCount)} icon={Package} tone="violet" compact />
            <KpiCard title={t('fleet.stock.qtyHere')} value={formatQty(totalQty)} icon={Package} tone="emerald" compact />
            <KpiCard title={t('fleet.stock.availableDepot')} value={formatQty(depotAvailable)} icon={Warehouse} tone="blue" compact />
            <KpiCard title={t('fleet.stock.history')} value={String(history.length)} icon={ArrowRightLeft} compact />
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              title={query ? t('fleet.stock.emptyPositions') : t('fleet.stock.emptyAction')}
              action={!query ? <Btn type="button" onClick={openAssign}>{t('fleet.stock.assignCta')}</Btn> : undefined}
            />
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('fleet.fields.designation')}</Th>
                  <Th mac>{t('fleet.fields.code')}</Th>
                  {!tranche && <Th mac>{t('fleet.stock.tranche')}</Th>}
                  <Th mac className="mac-th-num">{t('fleet.stock.qtyHere')}</Th>
                  <Th mac className="mac-th-num">{t('fleet.stock.qtyDepot')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const key = `${p.enginId}::${placeKey(p.tranche)}`;
                  return (
                    <tr key={key}>
                      <Td mac>
                        <Link to={`/engins/${p.enginId}`} className="mac-table-ref">{labelOf(p)}</Link>
                      </Td>
                      <Td mac className="mac-table-muted">{p.code || '—'}</Td>
                      {!tranche && <Td mac>{p.tranche || t('fleet.stock.wholeSite')}</Td>}
                      <Td mac className="mac-td-num font-semibold">{formatQty(p.quantity)}</Td>
                      <Td mac className="mac-td-num mac-table-muted">{p.depot != null ? formatQty(p.depot) : '—'}</Td>
                      <Td mac className="mac-td-actions">
                        <div className="flex justify-end gap-1">
                          <MacActionBtn
                            icon={Eye}
                            tone="blue"
                            title={t('fleet.stock.detail')}
                            onClick={() => { setDetailId(p.enginId); setDetailLabel(labelOf(p)); }}
                          />
                          <MacActionBtn
                            icon={Plus}
                            tone="teal"
                            title={t('fleet.stock.assignMore')}
                            onClick={() => { openAssign(); setPicked(p.enginId); setDestTranche(p.tranche || tranche || ''); }}
                          />
                          <MacActionBtn
                            icon={Undo2}
                            tone="orange"
                            title={t('fleet.stock.returnQty')}
                            onClick={() => openRow('return', p)}
                          />
                          <MacActionBtn
                            icon={ArrowRightLeft}
                            tone="gray"
                            title={t('fleet.stock.transferTo')}
                            onClick={() => openRow('transfer', p)}
                          />
                          {!tranche && (
                            <MacActionBtn
                              icon={Package}
                              tone="gray"
                              title={t('fleet.stock.changeTranche')}
                              onClick={() => openRow('split', p)}
                            />
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-gic-ink">{t('fleet.stock.history')}</p>
            {filteredHistory.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-gic-muted">{t('fleet.stock.empty')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('fleet.fields.designation')}</Th>
                    <Th mac>{t('fleet.stock.type')}</Th>
                    <Th mac className="mac-th-num">{t('fleet.fields.quantity')}</Th>
                    <Th mac>{t('fleet.stock.source')}</Th>
                    <Th mac>{t('fleet.stock.destination')}</Th>
                    <Th mac>{t('fields.remark')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map((move) => (
                    <tr key={move.id}>
                      <Td mac>{formatDate(move.date)}</Td>
                      <Td mac>
                        {move.engin ? (
                          <Link to={`/engins/${move.engin.id}`} className="mac-table-ref">{labelOf(move.engin)}</Link>
                        ) : '—'}
                      </Td>
                      <Td mac>{t(`fleet.stock.${move.movementType}`)}</Td>
                      <Td mac className="mac-td-num font-medium">{formatQty(move.quantity)}</Td>
                      <Td mac className="mac-table-muted">{moveSource(move)}</Td>
                      <Td mac className="mac-table-muted">{moveDest(move)}</Td>
                      <Td mac className="mac-table-muted">{move.remark || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        </div>
      )}

      {section === 'transfer' && (
        <SiteTransferPanel kind="materiel" chantierId={chantierId} tranche={tranche} onChanged={bump} />
      )}

      {section === 'synthese' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <MacSearch value={query} onChange={setQuery} placeholder={t('fleet.stock.search')} className="w-56" />
          </div>
          <div className="mac-kpi-grid mac-kpi-grid-4">
            <KpiCard title={t('fleet.stock.articles')} value={String(synthesisRows.length || articleCount)} icon={Package} tone="violet" compact />
            <KpiCard title={t('fleet.stock.qtyHere')} value={formatQty(totalQty)} icon={Package} tone="emerald" compact />
            <KpiCard title={t('fleet.costCat.total')} value={formatMad(synthesisRows.reduce((s, row) => s + row.total, 0))} icon={Wallet} compact />
          </div>
          {!costs || synthesisRows.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-gic-muted">{t('fleet.empty.costs')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('fleet.kind.materiel')}</Th>
                  {COST_CATEGORIES.map((cat) => <Th mac key={cat} className="text-right">{t(`fleet.costCat.${cat}`)}</Th>)}
                  <Th mac className="text-right">{t('fleet.costCat.total')}</Th>
                </tr>
              </thead>
              <tbody>
                {synthesisRows.map((row) => (
                  <tr key={row.enginId} className="cursor-pointer hover:bg-black/[0.02]" onClick={() => setOpenEnginId(row.enginId)}>
                    <Td mac><span className="mac-table-ref">{row.enginLabel}</span></Td>
                    {COST_CATEGORIES.map((cat) => <Td mac key={cat} className="text-right">{row[cat] ? formatMad(row[cat]) : '—'}</Td>)}
                    <Td mac className="text-right font-medium">{formatMad(row.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          {filtered.length > 0 && (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('fleet.fields.designation')}</Th>
                  {!tranche && <Th mac>{t('fleet.stock.tranche')}</Th>}
                  <Th mac className="mac-th-num">{t('fleet.stock.qtyHere')}</Th>
                  <Th mac className="mac-th-num">{t('fleet.stock.qtyDepot')}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={`${p.enginId}::${placeKey(p.tranche)}`}>
                    <Td mac><Link to={`/engins/${p.enginId}`} className="mac-table-ref">{labelOf(p)}</Link></Td>
                    {!tranche && <Td mac>{p.tranche || t('fleet.stock.wholeSite')}</Td>}
                    <Td mac className="mac-td-num font-semibold">{formatQty(p.quantity)}</Td>
                    <Td mac className="mac-td-num">{p.depot != null ? formatQty(p.depot) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <Modal
            open={!!openEnginId}
            size="xl"
            title={openEngin?.enginLabel || t('siteOps.synthesis')}
            onClose={() => setOpenEnginId(null)}
            footer={<Btn variant="secondary" onClick={() => setOpenEnginId(null)}>{t('common.close')}</Btn>}
          >
            {openLines.length === 0 ? (
              <p className="py-6 text-center text-[12px] text-gic-muted">{t('fleet.empty.costs')}</p>
            ) : (
              <TableWrap mac>
                <thead>
                  <tr>
                    <Th mac>{t('columns.date')}</Th>
                    <Th mac>{t('fleet.fields.tranche')}</Th>
                    <Th mac>{t('columns.designation')}</Th>
                    <Th mac>{t('columns.amount')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {openLines.map((line) => (
                    <tr key={`${line.source}-${line.sourceId}`}>
                      <Td mac>{line.periodStart ? `${formatDate(line.periodStart)} → ${formatDate(line.periodEnd)}` : formatDate(line.date)}</Td>
                      <Td mac className="mac-table-muted">{line.tranche || t('fleet.hints.wholeChantier')}</Td>
                      <Td mac><Link to={`/engins/${line.enginId}`} className="mac-table-ref">{line.label}</Link></Td>
                      <Td mac className="font-medium">{formatMad(line.amount)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Modal>
        </div>
      )}

      {section === 'retours' && (
        <div className="space-y-3">
          <p className="text-[12px] text-gic-muted">{t('fleet.stock.returnHint')}</p>
          <div>
            <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('columns.date')}</p>
            <MacDateInput value={date} onChange={setDate} placeholder={t('columns.date')} className="w-36" />
          </div>
          {filtered.length === 0 ? (
            <EmptyState title={t('fleet.stock.emptyPositions')} />
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('fleet.fields.designation')}</Th>
                  {!tranche && <Th mac>{t('fleet.stock.tranche')}</Th>}
                  <Th mac className="mac-th-num">{t('fleet.fields.quantity')}</Th>
                  <Th mac className="mac-th-num">{t('fleet.stock.returnQty')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const key = `${p.enginId}::${placeKey(p.tranche)}`;
                  return (
                    <tr key={key}>
                      <Td mac>
                        <Link to={`/engins/${p.enginId}`} className="mac-table-ref">{labelOf(p)}</Link>
                      </Td>
                      {!tranche && <Td mac>{p.tranche || t('fleet.stock.wholeSite')}</Td>}
                      <Td mac className="mac-td-num font-semibold">{formatQty(p.quantity)}</Td>
                      <Td mac>
                        <Input
                          type="number"
                          min="1"
                          max={Math.round(p.quantity)}
                          step="1"
                          inputMode="numeric"
                          value={returnQty[key] ?? formatQty(p.quantity)}
                          onChange={(e) => setReturnQty((cur) => ({ ...cur, [key]: intField(e.target.value) }))}
                        />
                      </Td>
                      <Td mac className="mac-td-actions">
                        <Btn variant="secondary" icon={Undo2} disabled={saving} onClick={() => void returnFromRow(p)}>
                          {t('fleet.stock.desaffectation')}
                        </Btn>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      <Modal
        open={!!action}
        size="lg"
        title={actionTitle}
        onClose={() => setAction(null)}
      >
        <form
          id="materiel-site-action"
          onSubmit={(e) => { e.preventDefault(); void saveAction(); }}
          className="grid gap-3 sm:grid-cols-2"
        >
          {action === 'assign' ? (
            <Select label={t('fleet.kind.materiel')} value={picked} onChange={(e) => setPicked(e.target.value)} required>
              <option value="">{t('common.choose')}</option>
              {assignChoices.map((item) => (
                <option key={item.id} value={item.id}>
                  {labelOf(item)} — {t('fleet.stock.depot')} {formatQty(item.depot)}
                </option>
              ))}
            </Select>
          ) : (
            <div className="sm:col-span-2">
              <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('fleet.kind.materiel')}</p>
              <p className="text-[13px] font-medium">{row ? labelOf(row) : '—'}</p>
            </div>
          )}
          <Input
            label={t('fleet.fields.quantity')}
            type="number"
            min="1"
            max={action === 'return' || action === 'split' || action === 'transfer' ? Math.round(row?.quantity || 1) : undefined}
            step="1"
            inputMode="numeric"
            required
            value={qty}
            onChange={(e) => setQty(intField(e.target.value) || e.target.value.replace(/\D/g, ''))}
          />
          {action === 'assign' && !tranche && (
            <Select label={t('fleet.stock.tranche')} value={destTranche} onChange={(e) => setDestTranche(e.target.value)}>
              <option value="">{t('fleet.stock.wholeSite')}</option>
              {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          )}
          {action === 'split' && (
            <>
              <Select label={t('fleet.stock.fromPlace')} value={fromPlace} onChange={(e) => setFromPlace(e.target.value)}>
                <option value="">{t('fleet.stock.wholeSite')}</option>
                {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
              <Select label={t('fleet.stock.toPlace')} value={destTranche} onChange={(e) => setDestTranche(e.target.value)}>
                <option value="">{t('fleet.stock.wholeSite')}</option>
                {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </>
          )}
          {action === 'transfer' && (
            <>
              <Select label={t('fleet.stock.destination')} value={destChantierId} onChange={(e) => setDestChantierId(e.target.value)} required>
                <option value="">{t('common.choose')}</option>
                {chantiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select label={t('fleet.stock.tranche')} value={destTranche} onChange={(e) => setDestTranche(e.target.value)}>
                <option value="">{t('fleet.stock.wholeSite')}</option>
                {destTranches.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </>
          )}
          <div>
            <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('columns.date')}</p>
            <MacDateInput value={date} onChange={setDate} placeholder={t('columns.date')} />
          </div>
          <Input label={t('fields.remark')} value={remark} onChange={(e) => setRemark(e.target.value)} />
          {action === 'assign' && pickedStock && (
            <p className="sm:col-span-2 text-[12px] text-gic-muted">{t('fleet.stock.depotAvailable', { qty: formatQty(pickedStock.depot) })}</p>
          )}
          {(action === 'return' || action === 'split' || action === 'transfer') && row && (
            <p className="sm:col-span-2 text-[12px] text-gic-muted">{t('fleet.stock.onSiteQty', { qty: formatQty(row.quantity) })}</p>
          )}
          <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
            <Btn type="button" variant="secondary" onClick={() => setAction(null)}>{t('common.cancel')}</Btn>
            <Btn type="button" disabled={saving || !picked} onClick={() => void saveAction()}>{t('common.save')}</Btn>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!detailId}
        size="xl"
        title={detailLabel || t('fleet.stock.detail')}
        onClose={() => setDetailId(null)}
        footer={<Btn variant="secondary" onClick={() => setDetailId(null)}>{t('common.close')}</Btn>}
      >
        {detailId && <MaterielStockPanel enginId={detailId} />}
      </Modal>
    </div>
  );
}
