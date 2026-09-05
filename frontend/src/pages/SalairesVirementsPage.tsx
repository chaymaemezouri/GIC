import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Printer, Plus, Trash2, RefreshCw, Building2, Users, HardHat, CheckSquare, Square,
} from 'lucide-react';
import { api } from '../lib/api';
import { marocBankSelectOptions } from '../lib/marocBanks';
import {
  printBankTransferList,
  type BankTransferPerson,
  type CompanyPrintSettings,
} from '../lib/printBankTransferList';
import { useI18n } from '../i18n/I18nContext';
import {
  Btn, Card, Input, MacSearch, MacSelect, TableWrap, Td, Th, EmptyState,
} from '../components/ui';

type SourceFilter = 'all' | 'ouvrier' | 'equipe';

type Candidate = BankTransferPerson;

export default function SalairesVirementsPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate[]>([]);
  const [source, setSource] = useState<SourceFilter>('all');
  const [bank, setBank] = useState('');
  const [q, setQ] = useState('');
  const [withRibOnly, setWithRibOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<CompanyPrintSettings | null>(null);
  const [periodLabel, setPeriodLabel] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString('fr-MA', { month: 'long', year: 'numeric' });
  });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      qs.set('source', source);
      if (bank) qs.set('bank', bank);
      if (q.trim()) qs.set('q', q.trim());
      if (withRibOnly) qs.set('withRib', 'true');
      const [list, company] = await Promise.all([
        api<{ items: Candidate[] }>(`/salaires/virement-candidates?${qs}`),
        api<CompanyPrintSettings>('/settings/company'),
      ]);
      setCandidates(list.items || []);
      setSettings(company);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('msg.loadError'));
    } finally {
      setLoading(false);
    }
  }, [source, bank, q, withRibOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const available = useMemo(
    () => candidates.filter((c) => !selectedIds.has(c.id)),
    [candidates, selectedIds],
  );

  function addOne(p: Candidate) {
    setSelected((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
  }

  function addMany(rows: Candidate[]) {
    setSelected((prev) => {
      const ids = new Set(prev.map((x) => x.id));
      const next = [...prev];
      for (const r of rows) {
        if (!ids.has(r.id)) next.push(r);
      }
      return next;
    });
  }

  function removeOne(id: string) {
    setSelected((prev) => prev.filter((x) => x.id !== id));
  }

  function clearSelected() {
    setSelected([]);
  }

  function printList() {
    if (selected.length === 0) {
      setError(t('msg.selectEmployeesToPrint'));
      return;
    }
    const missingRib = selected.filter((s) => !s.rib?.trim());
    if (missingRib.length > 0) {
      const ok = window.confirm(
        t('msg.printWithoutRib', { count: missingRib.length }),
      );
      if (!ok) return;
    }
    printBankTransferList(selected, settings || {}, {
      periodLabel: periodLabel || undefined,
      bankFilter: bank || undefined,
    });
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4'}>
      {!embedded && (
        <Card className="!p-4">
          <h2 className="text-[15px] font-semibold text-gic-ink tracking-tight">{t('pages.bankTransfers')}</h2>
          <p className="text-[12px] text-gic-muted mt-1">
            {t('pages.bankTransfersSubtitle')}
          </p>
        </Card>
      )}

      {error && (
        <Card className="border-gic-coral/40 bg-gic-coral-soft/20 !p-3">
          <p className="text-[12px] text-gic-coral">{error}</p>
        </Card>
      )}

      <Card className="!p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <MacSelect
            label={t('common.type')}
            value={source}
            onChange={(v) => setSource(v as SourceFilter)}
            options={[
              { value: 'all', label: t('msg.allWorkersAndTeam') },
              { value: 'ouvrier', label: t('msg.workersMo') },
              { value: 'equipe', label: t('pages.internalTeam') },
            ]}
          />
          <MacSelect
            label={t('fields.bank')}
            value={bank}
            onChange={setBank}
            options={marocBankSelectOptions(true).map((o) =>
              o.value === '' ? { value: '', label: t('msg.allBanks') } : o,
            )}
          />
          <div className="min-w-[180px] flex-1">
            <MacSearch value={q} onChange={setQ} placeholder={t('msg.nameCinRib')} />
          </div>
          <Input
            label={t('fields.printPeriod')}
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder={t('msg.periodExample')}
          />
          <label className="flex items-center gap-2 text-[12px] text-gic-ink pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={withRibOnly}
              onChange={(e) => setWithRibOnly(e.target.checked)}
              className="rounded border-gic-border"
            />
            {t('msg.withRibOnly')}
          </label>
          <Btn variant="secondary" icon={RefreshCw} onClick={() => load()} disabled={loading}>
            {t('common.refresh')}
          </Btn>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Disponibles */}
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gic-border/80">
            <div>
              <p className="text-[13px] font-semibold text-gic-ink">{t('msg.availableEmployees')}</p>
              <p className="text-[11px] text-gic-muted">{t('msg.resultsCount', { count: available.length })}</p>
            </div>
            <Btn
              variant="secondary"
              icon={Plus}
              disabled={available.length === 0}
              onClick={() => addMany(available)}
            >
              {t('actions.addAll')}
            </Btn>
          </div>
          {loading ? (
            <p className="text-[12px] text-gic-muted py-8 text-center">{t('common.loading')}</p>
          ) : available.length === 0 ? (
            <EmptyState title={t('msg.emptyEmployeesFilters')} />
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac />
                  <Th mac>{t('columns.name')}</Th>
                  <Th mac>{t('columns.type')}</Th>
                  <Th mac>{t('columns.bank')}</Th>
                  <Th mac>{t('columns.rib')}</Th>
                </tr>
              </thead>
              <tbody>
                {available.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-black/[0.02]" onClick={() => addOne(p)}>
                    <Td mac>
                      <Square size={15} className="text-gic-muted" />
                    </Td>
                    <Td mac>
                      <span className="font-medium">{p.lastName} {p.firstName}</span>
                      {p.cin && <span className="block text-[10px] text-gic-muted">{p.cin}</span>}
                    </Td>
                    <Td mac className="mac-table-muted">
                      {p.source === 'equipe' ? (
                        <span className="inline-flex items-center gap-1"><Users size={12} /> {t('msg.teamShort')}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><HardHat size={12} /> {t('columns.worker')}</span>
                      )}
                    </Td>
                    <Td mac className="mac-table-muted text-[11px]">{p.bankName || '—'}</Td>
                    <Td mac className="font-mono text-[11px]">{p.rib || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        {/* Sélection impression */}
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gic-border/80">
            <div>
              <p className="text-[13px] font-semibold text-gic-ink flex items-center gap-1.5">
                <Building2 size={14} className="text-[#007aff]" />
                {t('msg.printSelection')}
              </p>
              <p className="text-[11px] text-gic-muted">
                {t('msg.selectedForBank', { count: selected.length })}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Btn variant="secondary" icon={Trash2} disabled={selected.length === 0} onClick={clearSelected}>
                {t('actions.clear')}
              </Btn>
              <Btn icon={Printer} disabled={selected.length === 0} onClick={printList}>
                {t('common.print')}
              </Btn>
            </div>
          </div>
          {selected.length === 0 ? (
            <EmptyState title={t('msg.emptyPrintList')} />
          ) : (
            <TableWrap mac>
              <thead>
                <tr>
                  <Th mac />
                  <Th mac>{t('columns.name')}</Th>
                  <Th mac>{t('columns.cin')}</Th>
                  <Th mac>{t('columns.bankRib')}</Th>
                  <Th mac aria-label={t('common.remove')} />
                </tr>
              </thead>
              <tbody>
                {selected.map((p) => (
                  <tr key={p.id}>
                    <Td mac>
                      <CheckSquare size={15} className="text-[#007aff]" />
                    </Td>
                    <Td mac>
                      <span className="font-medium">{p.lastName} {p.firstName}</span>
                      <span className="block text-[10px] text-gic-muted">
                        {p.source === 'equipe' ? t('msg.teamShort') : t('columns.worker')}
                        {p.category ? ` · ${p.category}` : ''}
                      </span>
                    </Td>
                    <Td mac className="font-mono text-[11px]">{p.cin || '—'}</Td>
                    <Td mac>
                      <span className="text-[11px]">{p.bankName || '—'}</span>
                      <span className="block font-mono text-[11px] font-medium">{p.rib || '—'}</span>
                    </Td>
                    <Td mac>
                      <button
                        type="button"
                        className="text-gic-coral text-[11px] hover:underline"
                        onClick={() => removeOne(p.id)}
                      >
                        {t('common.remove')}
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          {selected.length > 0 && (
            <div className="px-4 py-3 border-t border-gic-border/80 flex flex-wrap gap-2 justify-end">
              <Btn icon={Printer} onClick={printList}>
                {t('actions.printList', { count: selected.length })}
              </Btn>
            </div>
          )}
        </Card>
      </div>

      <p className="text-[11px] text-gic-muted px-1">
        {t('msg.bankListCustomizeHintBefore')}{' '}
        <a href="/parametres?tab=liste_banque" className="text-[#007aff] hover:underline">
          {t('msg.bankListCustomizeLink')}
        </a>
        .
      </p>
    </div>
  );
}
