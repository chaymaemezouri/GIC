import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../../lib/api';
import { useI18n } from '../../i18n/I18nContext';
import { Btn, Input, KpiCard, Select, TableWrap, Td, Th } from '../ui';
import { Package, Warehouse, Wrench } from 'lucide-react';

type Site = { chantierId: string; chantierName?: string; tranche?: string | null; quantity: number };
type Move = {
  id: string;
  movementType: string;
  quantity: number;
  date: string;
  tranche?: string | null;
  fromTranche?: string | null;
  remark?: string | null;
  enginId?: string;
  engin?: { id: string; code?: string | null; designation?: string | null };
  chantier?: { id: string; name: string } | null;
  fromChantier?: { id: string; name: string } | null;
};
type Stock = { owned: number; depot: number; repair: number; sites: Site[]; movements: Move[] };
type Chantier = { id: string; name: string };
type Item = { id: string; code?: string | null; designation?: string | null };
type Position = { enginId: string; code?: string | null; designation?: string | null; chantierId?: string; chantierName?: string; tranche?: string | null; quantity: number };

const TYPES = ['entree', 'sortie', 'affectation', 'transfert', 'maintenance', 'retour'] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function MaterielStockPanel({
  enginId,
  chantierId,
  tranche: fixedTranche,
  onOpenDetail,
}: {
  enginId?: string;
  chantierId?: string;
  tranche?: string;
  onOpenDetail?: (id: string, label: string) => void;
}) {
  const { t } = useI18n();
  const [stock, setStock] = useState<Stock | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [tranches, setTranches] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(enginId || '');
  const [movementType, setMovementType] = useState<(typeof TYPES)[number]>('affectation');
  const [quantity, setQuantity] = useState('1');
  const [destId, setDestId] = useState(chantierId || '');
  const [tranche, setTranche] = useState(fixedTranche || '');
  const [source, setSource] = useState('depot');
  const [date, setDate] = useState(today());
  const [remark, setRemark] = useState('');

  const activeId = enginId || picked;

  function load() {
    if (enginId) {
      api<Stock>(`/engins/${enginId}/mouvements`).then(setStock).catch(() => setStock(null));
    }
    if (!enginId) {
      const qs = new URLSearchParams();
      if (chantierId) qs.set('chantierId', chantierId);
      if (fixedTranche) qs.set('tranche', fixedTranche);
      api<{ rows: Position[]; movements: Move[] }>(`/engins/materiel/positions${qs.toString() ? `?${qs}` : ''}`)
        .then((data) => {
          setPositions(data.rows || []);
          setHistory(data.movements || []);
        })
        .catch(() => { setPositions([]); setHistory([]); });
    }
  }

  useEffect(() => { load(); }, [enginId, chantierId, fixedTranche]);

  useEffect(() => {
    if (enginId) return;
    api<{ items: Item[] }>('/engins?kind=materiel&limit=100&sort=designation')
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]));
  }, [enginId]);

  useEffect(() => {
    api<{ items: Chantier[] }>('/chantiers?limit=100&sort=name&order=asc')
      .then((data) => setChantiers(data.items || []))
      .catch(() => setChantiers([]));
  }, []);

  useEffect(() => {
    if (!destId) { setTranches([]); return; }
    api<{ name: string }[]>(`/chantiers/${destId}/tranches`)
      .then((rows) => setTranches((rows || []).map((row) => row.name)))
      .catch(() => setTranches([]));
  }, [destId]);

  const needsDest = movementType === 'affectation' || movementType === 'transfert' || movementType === 'entree' || movementType === 'retour';
  const needsSource = movementType === 'sortie' || movementType === 'transfert' || movementType === 'maintenance';
  const sources = [
    { id: 'depot', label: t('fleet.stock.depot') },
    ...((stock?.sites || []).map((site) => ({
      id: `site:${site.chantierId}:${site.tranche || ''}`,
      label: `${site.chantierName || site.chantierId}${site.tranche ? ` · ${site.tranche}` : ''} (${site.quantity})`,
    }))),
  ];

  async function refreshPickedStock(id: string) {
    if (!id) { setStock(null); return; }
    const next = await api<Stock>(`/engins/${id}/mouvements`);
    setStock(next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId) return;
    const fromSite = source.startsWith('site:') ? source.slice(5).split(':') : null;
    const body: Record<string, unknown> = {
      movementType,
      quantity: Number(quantity),
      date,
      remark: remark || null,
    };
    if (movementType === 'transfert') {
      body.fromChantierId = fromSite?.[0] || null;
      body.fromTranche = fromSite?.[1] || null;
      body.chantierId = destId || null;
      body.tranche = tranche || null;
    } else if (movementType === 'sortie' || movementType === 'maintenance') {
      if (fromSite) {
        body.fromChantierId = movementType === 'maintenance' ? fromSite[0] : null;
        body.fromTranche = movementType === 'maintenance' ? (fromSite[1] || null) : null;
        body.chantierId = movementType === 'sortie' ? fromSite[0] : null;
        body.tranche = movementType === 'sortie' ? (fromSite[1] || null) : null;
      }
    } else if (destId) {
      body.chantierId = destId;
      body.tranche = tranche || null;
    }
    try {
      await api(`/engins/${activeId}/mouvements`, { method: 'POST', body: JSON.stringify(body) });
      setOpen(false);
      setQuantity('1');
      setRemark('');
      load();
      if (activeId) refreshPickedStock(activeId).catch(() => {});
    } catch (err) {
      const { appAlert } = await import('../../lib/dialog');
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  const moves = enginId ? (stock?.movements || []) : history;
  const place = (name?: string | null, extra?: string | null) => (name ? `${name}${extra ? ` · ${extra}` : ''}` : '');
  function moveSource(move: Move) {
    if (move.movementType === 'sortie') return place(move.chantier?.name, move.tranche) || t('fleet.stock.depot');
    if (move.movementType === 'maintenance') return place(move.fromChantier?.name, move.fromTranche) || t('fleet.stock.depot');
    if (move.movementType === 'retour') return t('fleet.stock.repair');
    if (move.movementType === 'transfert') return place(move.fromChantier?.name, move.fromTranche) || '—';
    if (move.movementType === 'affectation') return t('fleet.stock.depot');
    return '—';
  }
  function moveDest(move: Move) {
    if (move.movementType === 'sortie') return '—';
    if (move.movementType === 'maintenance') return t('fleet.stock.repair');
    if (move.movementType === 'retour') return place(move.chantier?.name, move.tranche) || t('fleet.stock.depot');
    return place(move.chantier?.name, move.tranche) || t('fleet.stock.depot');
  }

  return (
    <div className="mt-2 space-y-3">
      {enginId && stock && (
        <div className="mac-kpi-grid mac-kpi-grid-4">
          <KpiCard title={t('fleet.stock.total')} value={String(stock.owned)} icon={Package} tone="violet" compact />
          <KpiCard title={t('fleet.stock.depot')} value={String(stock.depot)} icon={Warehouse} tone="blue" compact />
          <KpiCard title={t('fleet.stock.onSites')} value={String(stock.sites.reduce((s, row) => s + row.quantity, 0))} icon={Package} tone="emerald" compact />
          <KpiCard title={t('fleet.stock.repair')} value={String(stock.repair)} icon={Wrench} tone="amber" compact />
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-gic-ink">{fixedTranche ? t('fleet.stock.onTranche') : chantierId ? t('fleet.stock.onSite') : t('fleet.stock.title')}</p>
        <Btn onClick={() => { setOpen(true); if (activeId) refreshPickedStock(activeId).catch(() => {}); }}>{t('fleet.stock.newMovement')}</Btn>
      </div>

      {!enginId && positions.length > 0 && (
        <div className="mac-kpi-grid mac-kpi-grid-4">
          <KpiCard title={t('fleet.kindPlural.materiel')} value={String(new Set(positions.map((row) => row.enginId)).size)} icon={Package} tone="violet" compact />
          <KpiCard title={t('fleet.fields.quantity')} value={String(positions.reduce((s, row) => s + row.quantity, 0))} icon={Warehouse} tone="emerald" compact />
          <KpiCard title={t('fleet.stock.history')} value={String(history.length)} icon={Wrench} compact />
        </div>
      )}

      {!enginId && (
        positions.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-gic-muted">{t('fleet.stock.empty')}</p>
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('fleet.fields.designation')}</Th>
                {!chantierId && <Th mac>{t('fleet.fields.chantier')}</Th>}
                <Th mac>{t('fleet.stock.tranche')}</Th>
                <Th mac>{t('fleet.fields.quantity')}</Th>
              </tr>
            </thead>
            <tbody>
              {positions.map((row) => (
                <tr
                  key={`${row.enginId}-${row.chantierId || ''}-${row.tranche || ''}`}
                  className={onOpenDetail ? 'cursor-pointer hover:bg-black/[0.02]' : undefined}
                  onClick={() => onOpenDetail?.(row.enginId, row.designation || row.code || t('fleet.kind.materiel'))}
                >
                  <Td mac>
                    <Link to={`/engins/${row.enginId}`} className="mac-table-ref" onClick={(e) => e.stopPropagation()}>{row.designation || row.code || '—'}</Link>
                  </Td>
                  {!chantierId && (
                    <Td mac>
                      {row.chantierId ? (
                        <Link to={`/chantiers/${row.chantierId}?tab=materiel`} className="hover:text-[#007aff]">{row.chantierName || row.chantierId}</Link>
                      ) : '—'}
                    </Td>
                  )}
                  <Td mac>{row.tranche || '—'}</Td>
                  <Td mac className="font-medium">{row.quantity}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )
      )}

      {enginId && stock && stock.sites.length > 0 && (
        <TableWrap mac>
          <thead>
            <tr>
              <Th mac>{t('fleet.stock.destination')}</Th>
              <Th mac>{t('fleet.stock.tranche')}</Th>
              <Th mac>{t('fleet.fields.quantity')}</Th>
            </tr>
          </thead>
          <tbody>
            {stock.sites.map((site) => (
              <tr key={`${site.chantierId}-${site.tranche || ''}`}>
                <Td mac>
                  <Link to={`/chantiers/${site.chantierId}?tab=materiel`} className="hover:text-[#007aff]">{site.chantierName || site.chantierId}</Link>
                </Td>
                <Td mac>{site.tranche || '—'}</Td>
                <Td mac className="font-medium">{site.quantity}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <p className="text-[13px] font-medium text-gic-ink">{t('fleet.stock.history')}</p>
      {moves.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-gic-muted">{t('fleet.stock.empty')}</p>
      ) : (
        <TableWrap mac>
          <thead>
            <tr>
              <Th mac>{t('common.date')}</Th>
              {!enginId && <Th mac>{t('fleet.fields.designation')}</Th>}
              <Th mac>{t('fleet.stock.type')}</Th>
              <Th mac>{t('fleet.fields.quantity')}</Th>
              <Th mac>{t('fleet.stock.source')}</Th>
              <Th mac>{t('fleet.stock.destination')}</Th>
            </tr>
          </thead>
          <tbody>
            {moves.map((move) => (
              <tr key={move.id}>
                <Td mac>{formatDate(move.date)}</Td>
                {!enginId && <Td mac>{move.engin?.designation || '—'}</Td>}
                <Td mac>{t(`fleet.stock.${move.movementType}`)}</Td>
                <Td mac className="font-medium">{move.quantity}</Td>
                <Td mac className="mac-table-muted">{moveSource(move)}</Td>
                <Td mac className="mac-table-muted">{moveDest(move)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {open && (
        <form onSubmit={save} className="grid gap-3 rounded-lg border border-black/[0.06] p-3 sm:grid-cols-2">
          {!enginId && (
            <Select label={t('fleet.kind.materiel')} value={picked} onChange={(e) => { setPicked(e.target.value); refreshPickedStock(e.target.value).catch(() => {}); }}>
              <option value="">{t('common.choose')}</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.designation || item.code}</option>)}
            </Select>
          )}
          <Select label={t('fleet.stock.type')} value={movementType} onChange={(e) => setMovementType(e.target.value as (typeof TYPES)[number])}>
            {TYPES.map((type) => <option key={type} value={type}>{t(`fleet.stock.${type}`)}</option>)}
          </Select>
          <Input label={t('fleet.fields.quantity')} type="number" min="0.01" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <Input label={t('common.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {needsSource && (
            <Select label={t('fleet.stock.source')} value={source} onChange={(e) => setSource(e.target.value)}>
              {sources.filter((row) => movementType !== 'transfert' || row.id !== 'depot').map((row) => (
                <option key={row.id} value={row.id}>{row.label}</option>
              ))}
            </Select>
          )}
          {needsDest && movementType !== 'entree' && movementType !== 'retour' ? (
            <>
              <Select label={t('fleet.stock.destination')} value={destId} onChange={(e) => setDestId(e.target.value)} disabled={!!chantierId && movementType === 'affectation'}>
                <option value="">{t('common.choose')}</option>
                {chantiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select label={t('fleet.stock.tranche')} value={tranche} onChange={(e) => setTranche(e.target.value)} disabled={!!fixedTranche}>
                <option value="">{t('common.choose')}</option>
                {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
              </Select>
            </>
          ) : needsDest ? (
            <>
              <Select label={t('fleet.stock.destination')} value={destId} onChange={(e) => setDestId(e.target.value)}>
                <option value="">{t('fleet.stock.depot')}</option>
                {chantiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {destId && (
                <Select label={t('fleet.stock.tranche')} value={tranche} onChange={(e) => setTranche(e.target.value)} disabled={!!fixedTranche}>
                  <option value="">{t('common.choose')}</option>
                  {tranches.map((name) => <option key={name} value={name}>{name}</option>)}
                </Select>
              )}
            </>
          ) : null}
          <Input label={t('fields.remark')} value={remark} onChange={(e) => setRemark(e.target.value)} />
          <div className="flex gap-2 sm:col-span-2">
            <Btn type="submit">{t('common.save')}</Btn>
            <Btn type="button" variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
          </div>
        </form>
      )}
    </div>
  );
}
