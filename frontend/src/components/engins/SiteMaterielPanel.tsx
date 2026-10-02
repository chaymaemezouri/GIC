import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, Wallet } from 'lucide-react';
import { api, formatDate, formatMad } from '../../lib/api';
import { appAlert } from '../../lib/dialog';
import { COST_CATEGORIES, todayISO, type CostBucket, type CostLine } from '../../lib/engins';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Input, KpiCard, MacDateInput, MacSearch, Modal, Select, TableWrap, Tabs, Td, Th } from '../ui';
import { MaterielStockPanel } from './MaterielStockPanel';
import { SiteTransferPanel } from './SiteTransferPanel';

type Section = 'quantite' | 'affectation' | 'repartition' | 'transfer' | 'desaffectation' | 'synthese';
type Position = { enginId: string; code?: string | null; designation?: string | null; chantierId?: string; chantierName?: string; tranche?: string | null; quantity: number };
type Item = { id: string; code?: string | null; designation?: string | null };
type Stock = { depot: number; sites: { chantierId: string; tranche?: string | null; quantity: number }[] };
type CostsPayload = {
  totals: CostBucket;
  byEngin: (CostBucket & { enginId: string; enginLabel: string; enginKind: string; days: number; hours: number })[];
  lines: CostLine[];
};

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
  const [section, setSection] = useState<Section>('quantite');
  const [reload, setReload] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLabel, setDetailLabel] = useState('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tranches, setTranches] = useState<string[]>([]);
  const [picked, setPicked] = useState('');
  const [qty, setQty] = useState('1');
  const [destTranche, setDestTranche] = useState(tranche || '');
  const [fromPlace, setFromPlace] = useState(tranche || '');
  const [date, setDate] = useState(todayISO());
  const [remark, setRemark] = useState('');
  const [stock, setStock] = useState<Stock | null>(null);
  const [saving, setSaving] = useState(false);
  const [costs, setCosts] = useState<CostsPayload | null>(null);
  const [openEnginId, setOpenEnginId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});

  function bump() {
    setReload((n) => n + 1);
    onChanged?.();
  }

  useEffect(() => {
    const qs = new URLSearchParams({ chantierId });
    if (tranche) qs.set('tranche', tranche);
    api<{ rows: Position[] }>(`/engins/materiel/positions?${qs}`)
      .then((data) => setPositions(data.rows || []))
      .catch(() => setPositions([]));
  }, [chantierId, tranche, reload]);

  useEffect(() => {
    api<{ items: Item[] }>('/engins?kind=materiel&limit=200&sort=designation')
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]));
    api<{ name: string }[]>(`/chantiers/${chantierId}/tranches`)
      .then((rows) => setTranches((rows || []).map((row) => row.name)))
      .catch(() => setTranches([]));
  }, [chantierId]);

  useEffect(() => {
    if (!picked) { setStock(null); return; }
    api<Stock>(`/engins/${picked}/mouvements`)
      .then((data) => setStock({ depot: data.depot, sites: data.sites || [] }))
      .catch(() => setStock(null));
  }, [picked, reload]);

  useEffect(() => {
    if (section !== 'synthese') return;
    const qs = new URLSearchParams({ chantierId, kind: 'materiel' });
    if (tranche) qs.set('tranche', tranche);
    api<CostsPayload>(`/engins/costs?${qs}`)
      .then(setCosts)
      .catch(() => setCosts(null));
  }, [section, chantierId, tranche, reload]);

  const onSiteForPicked = useMemo(
    () => (stock?.sites || []).filter((row) => row.chantierId === chantierId && (!tranche || (row.tranche || '') === tranche)),
    [stock, chantierId, tranche],
  );
  const onSiteQty = onSiteForPicked.reduce((s, row) => s + row.quantity, 0);
  const placeOptions = useMemo(() => {
    const names = new Set<string>(['']);
    for (const name of tranches) names.add(name);
    for (const row of positions) names.add(placeKey(row.tranche));
    return [...names];
  }, [tranches, positions]);

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

  async function postMove(enginId: string, body: Record<string, unknown>) {
    await api(`/engins/${enginId}/mouvements`, { method: 'POST', body: JSON.stringify(body) });
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setSaving(true);
    try {
      await postMove(picked, {
        movementType: 'affectation',
        quantity: Number(qty),
        date,
        remark: remark || null,
        chantierId,
        tranche: tranche || destTranche || null,
      });
      setQty('1');
      setRemark('');
      bump();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function split(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    if (placeKey(fromPlace) === placeKey(destTranche)) {
      await appAlert(t('siteOps.transferSamePlace'));
      return;
    }
    setSaving(true);
    try {
      await postMove(picked, {
        movementType: 'transfert',
        quantity: Number(qty),
        date,
        remark: remark || null,
        fromChantierId: chantierId,
        fromTranche: fromPlace || null,
        chantierId,
        tranche: tranche || destTranche || null,
      });
      setQty('1');
      setRemark('');
      bump();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function unassign(row: Position) {
    const key = `${row.enginId}::${placeKey(row.tranche)}`;
    const n = Number(returnQty[key] ?? row.quantity);
    if (!Number.isFinite(n) || n <= 0) return;
    setSaving(true);
    try {
      await postMove(row.enginId, {
        movementType: 'desaffectation',
        quantity: n,
        date,
        fromChantierId: chantierId,
        fromTranche: row.tranche || null,
      });
      bump();
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  const placeLabel = (value: string) => value || t('fleet.stock.wholeSite');

  return (
    <div className="mt-2 space-y-3">
      <Tabs
        mac
        active={section}
        onChange={(id) => setSection(id as Section)}
        tabs={[
          { id: 'quantite', label: t('fleet.stock.title') },
          { id: 'affectation', label: t('siteOps.affectation') },
          { id: 'repartition', label: t('fleet.stock.repartition') },
          { id: 'transfer', label: t('siteOps.transfer') },
          { id: 'desaffectation', label: t('fleet.stock.desaffectation') },
          { id: 'synthese', label: t('siteOps.synthesis') },
        ]}
      />

      {section === 'quantite' && (
        <MaterielStockPanel
          chantierId={chantierId}
          tranche={tranche}
          hideMovementForm
          onOpenDetail={(id, label) => { setDetailId(id); setDetailLabel(label); }}
        />
      )}

      {section === 'affectation' && (
        <form onSubmit={assign} className="space-y-3">
          <p className="text-[12px] text-gic-muted">{t('fleet.stock.assignHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t('fleet.kind.materiel')} value={picked} onChange={(e) => setPicked(e.target.value)} required>
              <option value="">{t('common.choose')}</option>
              {items.map((item) => <option key={item.id} value={item.id}>{labelOf(item)}</option>)}
            </Select>
            <Input label={t('fleet.fields.quantity')} type="number" min="0.01" step="1" required value={qty} onChange={(e) => setQty(e.target.value)} />
            {!tranche && (
              <Select label={t('fleet.stock.tranche')} value={destTranche} onChange={(e) => setDestTranche(e.target.value)}>
                <option value="">{t('fleet.stock.wholeSite')}</option>
                {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            )}
            <div>
              <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('columns.date')}</p>
              <MacDateInput value={date} onChange={setDate} placeholder={t('columns.date')} />
            </div>
            <Input label={t('fields.remark')} value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
          {stock && (
            <p className="text-[12px] text-gic-muted">{t('fleet.stock.depotAvailable', { qty: stock.depot })}</p>
          )}
          <Btn type="submit" disabled={saving || !picked}>{t('fleet.stock.assignQty')}</Btn>
        </form>
      )}

      {section === 'repartition' && (
        <div className="space-y-3">
          <p className="text-[12px] text-gic-muted">{t('fleet.stock.splitHint')}</p>
          {positions.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-gic-muted">{t('fleet.stock.emptyPositions')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('fleet.fields.designation')}</Th>
                  <Th mac>{t('fleet.stock.tranche')}</Th>
                  <Th mac>{t('fleet.fields.quantity')}</Th>
                </tr>
              </thead>
              <tbody>
                {positions.map((row) => (
                  <tr key={`${row.enginId}-${placeKey(row.tranche)}`}>
                    <Td mac><Link to={`/engins/${row.enginId}`} className="mac-table-ref">{labelOf(row)}</Link></Td>
                    <Td mac>{row.tranche || t('fleet.stock.wholeSite')}</Td>
                    <Td mac className="font-medium">{row.quantity}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <form onSubmit={split} className="grid gap-3 rounded-lg border border-black/[0.06] p-3 sm:grid-cols-2">
            <Select label={t('fleet.kind.materiel')} value={picked} onChange={(e) => setPicked(e.target.value)} required>
              <option value="">{t('common.choose')}</option>
              {[...new Set(positions.map((row) => row.enginId))].map((id) => {
                const row = positions.find((p) => p.enginId === id)!;
                return <option key={id} value={id}>{labelOf(row)}</option>;
              })}
            </Select>
            <Input label={t('fleet.fields.quantity')} type="number" min="0.01" step="1" required value={qty} onChange={(e) => setQty(e.target.value)} />
            <Select label={t('fleet.stock.fromPlace')} value={fromPlace} onChange={(e) => setFromPlace(e.target.value)}>
              {placeOptions.map((name) => <option key={name || 'whole'} value={name}>{placeLabel(name)}</option>)}
            </Select>
            <Select label={t('fleet.stock.toPlace')} value={destTranche} onChange={(e) => setDestTranche(e.target.value)}>
              {placeOptions.map((name) => <option key={`to-${name || 'whole'}`} value={name}>{placeLabel(name)}</option>)}
            </Select>
            <div>
              <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('columns.date')}</p>
              <MacDateInput value={date} onChange={setDate} placeholder={t('columns.date')} />
            </div>
            <Input label={t('fields.remark')} value={remark} onChange={(e) => setRemark(e.target.value)} />
            {picked && <p className="sm:col-span-2 text-[12px] text-gic-muted">{t('fleet.stock.onSiteQty', { qty: onSiteQty })}</p>}
            <div className="sm:col-span-2">
              <Btn type="submit" disabled={saving || !picked}>{t('fleet.stock.repartition')}</Btn>
            </div>
          </form>
        </div>
      )}

      {section === 'transfer' && (
        <SiteTransferPanel kind="materiel" chantierId={chantierId} tranche={tranche} onChanged={bump} />
      )}

      {section === 'desaffectation' && (
        <div className="space-y-3">
          <p className="text-[12px] text-gic-muted">{t('fleet.stock.returnHint')}</p>
          <div>
            <p className="mb-1 text-[11px] font-medium text-gic-muted">{t('columns.date')}</p>
            <MacDateInput value={date} onChange={setDate} placeholder={t('columns.date')} className="w-36" />
          </div>
          {positions.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-gic-muted">{t('fleet.stock.emptyPositions')}</p>
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac>{t('fleet.fields.designation')}</Th>
                  <Th mac>{t('fleet.stock.tranche')}</Th>
                  <Th mac>{t('fleet.fields.quantity')}</Th>
                  <Th mac>{t('fleet.stock.returnQty')}</Th>
                  <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {positions.map((row) => {
                  const key = `${row.enginId}::${placeKey(row.tranche)}`;
                  return (
                    <tr key={key}>
                      <Td mac><Link to={`/engins/${row.enginId}`} className="mac-table-ref">{labelOf(row)}</Link></Td>
                      <Td mac>{row.tranche || t('fleet.stock.wholeSite')}</Td>
                      <Td mac className="font-medium">{row.quantity}</Td>
                      <Td mac>
                        <Input
                          type="number"
                          min="0.01"
                          max={row.quantity}
                          step="1"
                          value={returnQty[key] ?? String(row.quantity)}
                          onChange={(e) => setReturnQty((cur) => ({ ...cur, [key]: e.target.value }))}
                        />
                      </Td>
                      <Td mac className="mac-td-actions">
                        <Btn variant="secondary" disabled={saving} onClick={() => unassign(row)}>{t('fleet.stock.desaffectation')}</Btn>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </div>
      )}

      {section === 'synthese' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <MacSearch value={query} onChange={setQuery} placeholder={t('fleet.filters.searchEngin')} className="w-56" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <KpiCard title={t('fleet.kindPlural.materiel')} value={synthesisRows.length} icon={Package} compact />
            <KpiCard title={t('fleet.fields.quantity')} value={positions.reduce((s, row) => s + row.quantity, 0)} icon={Package} compact />
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

      <Modal
        open={!!detailId}
        size="xl"
        title={detailLabel || t('fleet.stock.title')}
        onClose={() => setDetailId(null)}
        footer={<Btn variant="secondary" onClick={() => setDetailId(null)}>{t('common.close')}</Btn>}
      >
        {detailId && <MaterielStockPanel enginId={detailId} />}
      </Modal>
    </div>
  );
}
