import { appAlert, appConfirm } from '../lib/dialog';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCheck, Trash2, ExternalLink, SlidersHorizontal, Check,
  Mail, MailOpen, Inbox, Printer, Eye,
} from 'lucide-react';
import { api, type PaginatedResponse } from '../lib/api';
import type { AppNotification } from '../components/NotificationsDropdown';
import {
  formatNotificationDateTime, formatNotificationTime, getNotificationTypeMeta,
  NOTIFICATION_CATEGORIES,
} from '../lib/notificationDisplay';
import {
  Btn, Card, EmptyState, KpiCard, MacActionBtn, MacSearch,
  PageHeader, Pagination, Tabs, TableWrap, Td, Th,
} from '../components/ui';
import { useI18n } from '../i18n/I18nContext';
import type { TranslateFn } from '../i18n/types';

type NotifResponse = PaginatedResponse<AppNotification> & { unreadCount: number };
type Stats = { total: number; unread: number; read: number };
type TabFilter = 'all' | 'unread';

const PAGE_SIZE = 20;

function notifCategoryLabel(id: string, t: TranslateFn): string {
  const map: Record<string, string> = {
    '': t('msg.notifAllTypes'),
    alert: t('dashboard.alerts'),
    success: t('common.success'),
    achat: t('pages.purchases'),
    chantier: t('pages.sites'),
    finance: t('nav.group.finance'),
    doc: t('pages.documents'),
    info: t('tabs.informations'),
  };
  return map[id] ?? NOTIFICATION_CATEGORIES.find((f) => f.id === id)?.label ?? id;
}

function notifTypeChipLabel(type: string, t: TranslateFn): string {
  const lower = (type || 'info').toLowerCase();
  if (lower.includes('alert') || lower.includes('error') || lower.includes('retard') || lower === 'warning') {
    return t('msg.notifAlert');
  }
  if (lower.includes('success') || lower.includes('ok') || lower.includes('valid')) return t('common.success');
  if (lower.includes('achat') || lower.includes('purchase')) return t('create.purchase');
  if (lower.includes('chantier') || lower.includes('ops')) return t('create.site');
  if (lower.includes('finance') || lower.includes('paiement') || lower.includes('caisse')) return t('nav.group.finance');
  if (lower.includes('doc')) return t('create.document');
  return t('msg.notifInfo');
}

export default function NotificationsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab: TabFilter = searchParams.get('unread') === '1' ? 'unread' : 'all';
  const [tab, setTab] = useState<TabFilter>(initialTab);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [stats, setStats] = useState<Stats>({ total: 0, unread: 0, read: 0 });
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');
  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function buildQuery(pageNum = page, overrides?: { q?: string; category?: string; unread?: boolean }) {
    const qs = new URLSearchParams();
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const cat = overrides?.category !== undefined ? overrides.category : categoryFilter;
    const unreadOnly = overrides?.unread !== undefined ? overrides.unread : tab === 'unread';
    if (unreadOnly) qs.set('unread', '1');
    if (qVal) qs.set('q', qVal);
    if (cat) qs.set('category', cat);
    qs.set('page', String(pageNum));
    qs.set('limit', String(PAGE_SIZE));
    return qs.toString();
  }

  function buildStatsQuery(overrides?: { q?: string; category?: string; unread?: boolean }) {
    const qs = new URLSearchParams();
    const qVal = overrides?.q !== undefined ? overrides.q : q;
    const cat = overrides?.category !== undefined ? overrides.category : categoryFilter;
    const unreadOnly = overrides?.unread !== undefined ? overrides.unread : tab === 'unread';
    if (unreadOnly) qs.set('unread', '1');
    if (qVal) qs.set('q', qVal);
    if (cat) qs.set('category', cat);
    return qs.toString();
  }

  function syncUrl(pageNum = page) {
    const qs = new URLSearchParams();
    if (tab === 'unread') qs.set('unread', '1');
    if (q) qs.set('q', q);
    if (categoryFilter) qs.set('category', categoryFilter);
    if (pageNum > 1) qs.set('page', String(pageNum));
    setSearchParams(qs, { replace: true });
  }

  function load(
    pageNum = page,
    overrides?: { q?: string; category?: string; unread?: boolean },
  ) {
    setLoading(true);
    setError('');
    const statsQs = buildStatsQuery(overrides);
    Promise.all([
      api<NotifResponse>(`/notifications?${buildQuery(pageNum, overrides)}`),
      api<Stats>(`/notifications/stats?${statsQs}`),
    ])
      .then(([res, st]) => {
        setItems(res.items);
        setPage(res.page);
        setPages(res.pages);
        setTotal(res.total);
        setUnreadCount(res.unreadCount);
        setStats(st);
        syncUrl(res.page);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(page);
  }, []);

  useEffect(() => {
    if (!showFilters) return;
    function onClick(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setShowFilters(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowFilters(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [showFilters]);

  function switchTab(next: TabFilter) {
    setTab(next);
    setPage(1);
    load(1, { unread: next === 'unread' });
  }

  async function markAsRead(n: AppNotification) {
    if (n.isRead) return;
    await api(`/notifications/${n.id}/read`, { method: 'POST' });
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    setUnreadCount((c) => Math.max(0, c - 1));
    setStats((s) => ({ total: s.total, unread: Math.max(0, s.unread - 1), read: s.read + 1 }));
  }

  async function markAllAsRead() {
    await api('/notifications/read-all', { method: 'POST' });
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnreadCount(0);
    setStats((s) => ({ total: s.total, unread: 0, read: s.total }));
  }

  async function deleteNotification(id: string) {
    const target = items.find((x) => x.id === id);
    if (!await appConfirm(t('msg.confirmDeleteNotification'))) return;
    try {
      await api(`/notifications/${id}`, { method: 'DELETE' });
      load(page);
      if (target && !target.isRead) setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : t('common.error'));
    }
  }

  function openNotification(n: AppNotification) {
    markAsRead(n);
    if (n.link) navigate(n.link);
  }

  function printList() {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;padding:24px;font-size:11px">
      <h1>Notifications — GIC</h1>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr><th>Date</th><th>Type</th><th>Titre</th><th>Message</th><th>Lu</th></tr>
        ${items.map((n) => {
          const meta = getNotificationTypeMeta(n.type);
          return `<tr><td>${formatNotificationDateTime(n.createdAt)}</td><td>${meta.label}</td><td>${n.title}</td><td>${n.message}</td><td>${n.isRead ? 'Oui' : 'Non'}</td></tr>`;
        }).join('')}
      </table>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const hasActiveFilters = !!q || !!categoryFilter;

  return (
    <div className="space-y-0">
      <PageHeader
        mac
        title={t('pages.notifications')}
        subtitle={t('pages.notificationsSubtitle')}
        actions={
          <>
            {unreadCount > 0 && (
              <Btn variant="secondary" icon={CheckCheck} onClick={markAllAsRead}>
                {t('actions.markAllReadFull')}
              </Btn>
            )}
            <div className="mac-action-group">
              <MacActionBtn icon={Printer} tone="gray" title={t('common.print')} onClick={printList} />
            </div>
          </>
        }
      />

      <div className="mac-kpi-grid mac-kpi-grid-3 mb-4">
        <KpiCard title={t('columns.total')} value={stats.total} icon={Inbox} tone="violet" compact />
        <KpiCard title={t('kpi.unread')} value={stats.unread} icon={Mail} tone="coral" compact />
        <KpiCard title={t('kpi.read')} value={stats.read} icon={MailOpen} tone="emerald" compact />
      </div>

      <Card className="mb-4">
        <Tabs
          mac
          active={tab}
          onChange={(id) => switchTab(id as TabFilter)}
          tabs={[
            { id: 'all', label: t('msg.tabsAll', { count: stats.total }) },
            { id: 'unread', label: t('msg.tabsUnread', { count: unreadCount }) },
          ]}
        />
      </Card>

      <div className={`mac-filters-panel mb-4${showFilters ? ' mac-filters-panel-open' : ''}`}>
        <div className="mac-filters-row">
          <div className="mac-filters-toolbar">
            <MacSearch
              value={q}
              onChange={setQ}
              onSubmit={() => { setPage(1); load(1); }}
              placeholder={t('msg.searchNotification')}
            />
            <div ref={filtersRef} className="relative shrink-0 z-50">
              <Btn
                variant="secondary"
                icon={SlidersHorizontal}
                title={t('common.filters')}
                aria-label={t('common.filters')}
                className={`!px-2 !py-2 relative${hasActiveFilters ? ' ring-1 ring-[#007aff]/40' : ''}`}
                onClick={() => setShowFilters((v) => !v)}
              >
                {hasActiveFilters && <span className="mac-filter-dot" aria-hidden />}
              </Btn>
              {showFilters && (
                <div className="mac-filter-menu" role="menu">
                  <p className="mac-filter-menu-section">{t('common.type')}</p>
                  {NOTIFICATION_CATEGORIES.map((f) => (
                    <button
                      key={f.id || 'all-cat'}
                      type="button"
                      role="menuitem"
                      className={`mac-filter-menu-item${categoryFilter === f.id ? ' mac-filter-menu-item-active' : ''}`}
                      onClick={() => {
                        setCategoryFilter(f.id);
                        setPage(1);
                        load(1, { category: f.id });
                      }}
                    >
                      <span>{notifCategoryLabel(f.id, t)}</span>
                      {categoryFilter === f.id && <Check size={13} strokeWidth={2.5} className="mac-filter-menu-check" />}
                    </button>
                  ))}
                  {hasActiveFilters && (
                    <>
                      <div className="mac-filter-menu-sep" />
                      <button
                        type="button"
                        className="mac-filter-menu-item mac-filter-menu-reset"
                        onClick={() => {
                          setQ('');
                          setCategoryFilter('');
                          setPage(1);
                          load(1, { q: '', category: '' });
                          setShowFilters(false);
                        }}
                      >
                        {t('common.reset')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <Btn variant="secondary" onClick={() => { setPage(1); load(1); }}>{t('common.filter')}</Btn>
          </div>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-gic-coral/40 bg-gic-coral-soft/30">
          <p className="text-[12px] text-gic-coral font-medium">{error}</p>
          <Btn variant="secondary" className="mt-2" onClick={() => load(page)}>{t('common.retry')}</Btn>
        </Card>
      )}

      <Card padding={false}>
        {loading ? (
          <p className="p-6 text-[12px] text-gic-muted text-center">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <EmptyState title={tab === 'unread' ? t('msg.emptyNotificationsUnread') : t('msg.emptyNotifications')} />
        ) : (
          <TableWrap mac>
            <thead>
              <tr>
                <Th mac>{t('columns.type')}</Th>
                <Th mac>{t('columns.titleCol')}</Th>
                <Th mac>{t('columns.message')}</Th>
                <Th mac>{t('columns.date')}</Th>
                <Th mac>{t('columns.status')}</Th>
                <Th mac className="mac-th-actions" aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((n) => {
                const meta = getNotificationTypeMeta(n.type);
                const Icon = meta.icon;
                return (
                  <tr
                    key={n.id}
                    className={`cursor-pointer${!n.isRead ? ' bg-[#007aff]/[0.04]' : ''}`}
                    onClick={() => openNotification(n)}
                  >
                    <Td mac>
                      <span className={`mac-chip inline-flex items-center gap-1 ${meta.chip}`}>
                        <Icon size={10} />
                        {notifTypeChipLabel(n.type, t)}
                      </span>
                    </Td>
                    <Td mac className={`max-w-[200px] truncate ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>
                      {n.title}
                    </Td>
                    <Td mac className="mac-table-muted max-w-[280px] truncate">{n.message}</Td>
                    <Td mac className="mac-table-muted whitespace-nowrap">
                      <span className="hidden sm:inline">{formatNotificationDateTime(n.createdAt)}</span>
                      <span className="sm:hidden">{formatNotificationTime(n.createdAt)}</span>
                    </Td>
                    <Td mac>
                      {n.isRead ? (
                        <span className="mac-chip mac-chip-gray">{t('status.readOne')}</span>
                      ) : (
                        <span className="mac-chip mac-chip-violet">{t('status.unreadOne')}</span>
                      )}
                    </Td>
                    <Td mac className="mac-td-actions">
                      <div className="mac-actions" onClick={(e) => e.stopPropagation()}>
                        {n.link && (
                          <MacActionBtn
                            icon={ExternalLink}
                            tone="blue"
                            title={t('actions.open')}
                            onClick={() => openNotification(n)}
                          />
                        )}
                        {!n.isRead && (
                          <MacActionBtn
                            icon={CheckCheck}
                            tone="green"
                            title={t('actions.markRead')}
                            onClick={() => markAsRead(n)}
                          />
                        )}
                        <MacActionBtn
                          icon={Eye}
                          tone="gray"
                          title={t('common.view')}
                          onClick={() => openNotification(n)}
                        />
                        <MacActionBtn
                          icon={Trash2}
                          tone="red"
                          title={t('common.delete')}
                          onClick={() => deleteNotification(n.id)}
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <Pagination page={page} pages={pages} total={total} limit={PAGE_SIZE} onPage={(p) => load(p)} mac />
      </Card>
    </div>
  );
}
