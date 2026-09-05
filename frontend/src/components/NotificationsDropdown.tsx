import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  X,
  ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatNotificationTime, getNotificationTypeMeta } from '../lib/notificationDisplay';
import { useI18n } from '../i18n/I18nContext';

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link?: string | null;
  createdAt: string;
};

type NotifResponse = { items: AppNotification[]; unreadCount: number };

type Props = {
  onCountChange?: (n: number) => void;
};

export default function NotificationsDropdown({ onCountChange }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<NotifResponse>('/notifications?limit=12');
      setItems(res.items || []);
      setUnreadCount(res.unreadCount || 0);
      onCountChange?.(res.unreadCount || 0);
    } catch {
      // ignore network errors in header
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 45_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, load]);

  async function openNotification(n: AppNotification) {
    if (!n.isRead) {
      try {
        await api(`/notifications/${n.id}/read`, { method: 'POST' });
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
        setUnreadCount((c) => {
          const next = Math.max(0, c - 1);
          onCountChange?.(next);
          return next;
        });
      } catch {
        // ignore
      }
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  async function markAllAsRead() {
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
      setUnreadCount(0);
      onCountChange?.(0);
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  async function removeNotification(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await api(`/notifications/${id}`, { method: 'DELETE' });
      setItems((prev) => {
        const removed = prev.find((x) => x.id === id);
        if (removed && !removed.isRead) {
          setUnreadCount((c) => {
            const next = Math.max(0, c - 1);
            onCountChange?.(next);
            return next;
          });
        }
        return prev.filter((x) => x.id !== id);
      });
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        className={`shell-icon-btn relative ${open ? 'shell-icon-btn-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={t('nav.notifications')}
        aria-expanded={open}
      >
        <Bell size={17} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-gic-coral text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('actions.notificationsListAria')}
          className="absolute right-0 top-full mt-2 w-[min(100vw-1.5rem,380px)] rounded-2xl bg-white border border-gic-border shadow-2xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-gic-border flex items-center justify-between gap-2 bg-gradient-to-r from-gic-violet-soft/40 to-white">
            <div>
              <p className="text-[13px] font-semibold text-gic-ink">{t('nav.notifications')}</p>
              <p className="text-[10px] text-gic-muted">
                {unreadCount > 0
                  ? t(unreadCount > 1 ? 'common.unreadMany' : 'common.unreadOne', { count: unreadCount })
                  : t('common.allUpToDate')}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={markAllAsRead}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium text-gic-violet hover:bg-gic-violet-soft transition-colors disabled:opacity-50"
              >
                <CheckCheck size={12} />
                {t('common.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-[min(70vh,420px)] overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <Bell size={28} className="mx-auto text-gic-muted/40 mb-2" />
                <p className="text-[12px] text-gic-muted">{t('msg.emptyNotifications')}</p>
              </div>
            ) : (
              items.map((n) => {
                const meta = getNotificationTypeMeta(n.type);
                const Icon = meta.icon;
                const iconBg = {
                  coral: 'bg-gic-coral-soft text-gic-coral',
                  emerald: 'bg-emerald-50 text-emerald-600',
                  amber: 'bg-gic-amber-soft text-gic-amber',
                  orange: 'bg-orange-50 text-orange-600',
                  violet: 'bg-gic-violet-soft text-gic-violet',
                  sky: 'bg-sky-50 text-sky-600',
                  gray: 'bg-gic-violet-soft text-gic-violet',
                }[meta.tone];
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openNotification(n)}
                    onKeyDown={(e) => e.key === 'Enter' && openNotification(n)}
                    className={`w-full text-left px-3 py-2.5 flex gap-3 border-b border-gic-border/40 hover:bg-gray-50/90 transition-colors group cursor-pointer ${
                      !n.isRead ? 'bg-gic-violet-soft/25' : ''
                    }`}
                  >
                    <div
                      className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}
                    >
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p
                          className={`text-[12px] leading-snug line-clamp-1 flex-1 ${
                            !n.isRead ? 'font-semibold text-gic-ink' : 'font-medium text-gic-ink/90'
                          }`}
                        >
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-gic-violet shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-gic-muted line-clamp-2 mt-0.5">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-gic-muted">{formatNotificationTime(n.createdAt)}</span>
                        {n.link && (
                          <span className="text-[9px] text-gic-violet inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {t('actions.open')} <ExternalLink size={9} />
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      title={t('common.dismiss')}
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded-full flex items-center justify-center text-gic-muted hover:bg-gray-200 hover:text-gic-ink shrink-0 mt-1"
                      onClick={(e) => removeNotification(e, n.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-3 py-2.5 border-t border-gic-border bg-gray-50/80">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-[11px] font-medium text-gic-violet hover:underline py-1"
            >
              {t('actions.seeAllNotifications')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
