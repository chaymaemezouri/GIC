import { useEffect, useRef, useState, type ReactNode, type TdHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Calendar, Search, X } from 'lucide-react';
import { canGoBackInApp, goBackOrFallback } from '../lib/navigation';
import { useI18n } from '../i18n/I18nContext';

export function Card({
  children,
  className = '',
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div className={`mac-panel ${padding ? 'p-4' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mac-section-label">{children}</h2>;
}

export function StatCell({
  title,
  value,
  delta,
  deltaTone = 'muted',
  icon: Icon,
  tone = 'blue',
  className = '',
}: {
  title: string;
  value: string | number;
  delta?: string;
  deltaTone?: 'emerald' | 'coral' | 'muted';
  icon?: LucideIcon;
  tone?: 'blue' | 'teal' | 'green' | 'orange' | 'purple';
  className?: string;
}) {
  const compact = String(value).length > 10;
  return (
    <div className={`mac-stat-cell ${className}`}>
      <div className="mac-stat-top">
        {Icon && (
          <span className={`mac-stat-icon mac-stat-icon-${tone}`} aria-hidden>
            <Icon size={13} strokeWidth={2.25} />
          </span>
        )}
        <p className="mac-stat-label">{title}</p>
      </div>
      <p className={`mac-stat-value${compact ? ' mac-stat-value-sm' : ''}`}>{value}</p>
      {delta && <p className={`mac-stat-meta mac-stat-meta-${deltaTone}`}>{delta}</p>}
    </div>
  );
}

export function KpiCard({
  title,
  value,
  icon: Icon,
  tone = 'violet',
  delta,
  deltaTone = 'emerald',
  compact = false,
  className = '',
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  tone?: 'violet' | 'emerald' | 'coral' | 'amber' | 'teal' | 'orange' | 'purple';
  delta?: string;
  deltaTone?: 'emerald' | 'coral' | 'muted';
  compact?: boolean;
  className?: string;
}) {
  const iconTones = {
    violet: 'text-gic-violet',
    emerald: 'text-gic-emerald',
    coral: 'text-gic-coral',
    amber: 'text-gic-amber',
    teal: 'text-gic-violet',
    orange: 'text-gic-amber',
    purple: 'text-gic-violet',
  };
  const deltaTones = {
    emerald: 'mac-stat-meta-emerald',
    coral: 'mac-stat-meta-coral',
    muted: 'mac-stat-meta-muted',
  };
  return (
    <div className={`mac-kpi-card ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <Icon size={14} strokeWidth={1.75} className={iconTones[tone]} />
        {delta && (
          <span className={`text-[10px] font-medium truncate max-w-[55%] text-right ${deltaTones[deltaTone]}`}>
            {delta}
          </span>
        )}
      </div>
      <div>
        <p className={`mac-stat-value${compact ? ' mac-stat-value-sm' : ''}`}>{value}</p>
        <p className="mac-stat-label mt-1">{title}</p>
      </div>
    </div>
  );
}

export function PageBackLink({
  to,
  fallbackTo,
  onClick,
  label,
  iconOnly = true,
  className = '',
}: {
  /** Navigation explicite (ignore l'historique). */
  to?: string;
  /** Destination si l'historique est vide (accès direct par URL). */
  fallbackTo?: string;
  onClick?: () => void;
  label?: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const resolvedLabel = label ?? t('common.back');
  const navigate = useNavigate();
  const cls = `mac-page-back${className ? ` ${className}` : ''}`;
  const content = (
    <>
      <ArrowLeft size={18} strokeWidth={2} />
      {!iconOnly && <span>{resolvedLabel}</span>}
    </>
  );

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (to) {
      navigate(to);
      return;
    }
    goBackOrFallback(
      (delta) => navigate(delta),
      (path) => navigate(path),
      fallbackTo,
    );
  };

  return (
    <button type="button" onClick={handleClick} className={cls} title={resolvedLabel} aria-label={resolvedLabel}>
      {content}
    </button>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  mac = false,
  backTo,
  backFallback,
  backLabel,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  mac?: boolean;
  /** false = masquer ; string = route explicite ; undefined = page précédente */
  backTo?: string | false;
  backFallback?: string;
  backLabel?: string;
}) {
  const { t } = useI18n();
  const resolvedBackLabel = backLabel ?? t('common.back');
  const showBack = mac && backTo !== false;
  const canBack = canGoBackInApp();
  const showBackButton = showBack && (typeof backTo === 'string' || canBack || !!backFallback);

  if (mac) {
    return (
      <div className="mac-page-header">
        {showBackButton && (
          <PageBackLink
            to={typeof backTo === 'string' ? backTo : undefined}
            fallbackTo={backFallback}
            label={resolvedBackLabel}
          />
        )}
        <div className="mac-page-header-body">
          <div className="mac-page-header-row">
            <div>
              <h1 className="mac-page-title">{title}</h1>
              {subtitle && <p className="mac-page-subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="mac-page-actions">{actions}</div>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[12px] text-gic-muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Btn({
  children,
  variant = 'primary',
  icon: Icon,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: LucideIcon;
}) {
  const styles = {
    primary: 'bg-gic-violet text-white hover:brightness-95 shadow-[0_0.5px_1px_rgba(0,0,0,0.1)]',
    secondary: 'bg-white shadow-[var(--shadow-panel)] text-gic-ink hover:bg-black/[0.02] border border-transparent',
    ghost: 'bg-transparent text-gic-muted hover:bg-black/[0.04] hover:text-gic-ink border border-transparent',
    danger: 'bg-gic-coral-soft text-gic-coral hover:bg-red-100 border border-transparent',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={14} strokeWidth={2} />}
      {children}
    </button>
  );
}

/** Bouton icône coloré style macOS (actions tableau) */
export function MacActionBtn({
  icon: Icon,
  tone = 'blue',
  title,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  tone?: 'blue' | 'teal' | 'orange' | 'red' | 'green' | 'gray';
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`mac-action-btn mac-action-btn-${tone} ${className}`}
      {...props}
    >
      <Icon size={14} strokeWidth={2.15} />
    </button>
  );
}

export function MacSearch({
  value,
  onChange,
  onSubmit,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`mac-search ${className}`}>
      <Search size={14} strokeWidth={2} className="mac-search-icon" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
        placeholder={placeholder ?? t('common.searchEllipsis')}
        className="mac-search-input"
      />
    </div>
  );
}

export function Input({
  label,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-[11px] font-medium text-gic-muted mb-1">{label}</span>}
      <input
        className={`w-full rounded-md border border-black/[0.1] bg-black/[0.02] px-2.5 py-1.5 text-[12px] outline-none focus:border-gic-violet focus:bg-white focus:ring-[3px] focus:ring-gic-violet/12 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Select({
  label,
  children,
  className = '',
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-[11px] font-medium text-gic-muted mb-1">{label}</span>}
      <select
        className={`w-full rounded-md border border-black/[0.1] bg-black/[0.02] px-2.5 py-1.5 text-[12px] outline-none focus:border-gic-violet focus:bg-white focus:ring-[3px] focus:ring-gic-violet/12 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Textarea({
  label,
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="block text-[11px] font-medium text-gic-muted mb-1">{label}</span>}
      <textarea
        className={`w-full rounded-md border border-black/[0.1] bg-black/[0.02] px-2.5 py-2 text-[12px] outline-none resize-y min-h-[72px] focus:border-gic-violet focus:bg-white focus:ring-[3px] focus:ring-gic-violet/12 ${className}`}
        {...props}
      />
    </label>
  );
}

/** Dropdown custom style macOS (menu verre + survol bleu) */
export function MacSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  className = '',
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? placeholder ?? t('common.choose');

  function updateMenuPos() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    function onScrollOrResize() {
      updateMenuPos();
    }
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const menu = open ? (
    <div
      ref={menuRef}
      className="mac-select-menu mac-select-menu-portal"
      role="listbox"
      style={{
        position: 'fixed',
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
        zIndex: 200,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value || '__all'}
            type="button"
            role="option"
            aria-selected={active}
            className={`mac-select-option${active ? ' mac-select-option-active' : ''}`}
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
          >
            <span className="truncate">{o.label}</span>
            {active && <Check size={13} strokeWidth={2.5} className="mac-select-check shrink-0" />}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div ref={ref} className={`mac-select ${className}`}>
      {label && <span className="mac-select-label">{label}</span>}
      <button
        ref={triggerRef}
        type="button"
        className={`mac-select-trigger${open ? ' mac-select-trigger-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="mac-select-value truncate">{display}</span>
        <ChevronDown size={12} strokeWidth={2.25} className={`mac-select-chevron${open ? ' rotate-180' : ''}`} />
      </button>
      {menu && createPortal(menu, document.body)}
    </div>
  );
}

/** Champ date style macOS avec calendrier custom */
export function MacDateInput({
  label,
  value,
  onChange,
  className = '',
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const { t, lang } = useI18n();
  const resolvedPlaceholder = placeholder ?? t('fields.chooseDate');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parseIsoDate(value) ?? new Date());
  const ref = useRef<HTMLDivElement>(null);
  const selected = parseIsoDate(value);
  const today = startOfDay(new Date());
  const locale = lang === 'ar' ? 'ar-MA' : 'fr-FR';
  const weekdays = [
    t('common.weekdayMon'),
    t('common.weekdayTue'),
    t('common.weekdayWed'),
    t('common.weekdayThu'),
    t('common.weekdayFri'),
    t('common.weekdaySat'),
    t('common.weekdaySun'),
  ];

  useEffect(() => {
    const d = parseIsoDate(value);
    if (d) setView(d);
  }, [value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const display = selected
    ? selected.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
    : resolvedPlaceholder;

  const year = view.getFullYear();
  const month = view.getMonth();
  const days = getCalendarDays(year, month);

  function pick(day: Date) {
    onChange(toIsoDate(day));
    setOpen(false);
  }

  return (
    <div ref={ref} className={`mac-date${open ? ' mac-date-open' : ''} ${className}`}>
      {label && <span className="mac-date-label">{label}</span>}
      <button
        type="button"
        className={`mac-date-trigger${open ? ' mac-date-trigger-open' : ''}${!value ? ' mac-date-trigger-empty' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="mac-date-value truncate">{display}</span>
        <Calendar size={13} strokeWidth={2} className="mac-date-icon shrink-0" />
      </button>
      {open && (
        <div className="mac-date-picker" role="dialog" aria-label={label ?? t('common.calendar')}>
          <div className="mac-date-picker-header">
            <button
              type="button"
              className="mac-date-picker-nav"
              aria-label={t('common.prevMonth')}
              onClick={() => setView(new Date(year, month - 1, 1))}
            >
              <ChevronLeft size={14} strokeWidth={2.25} />
            </button>
            <span className="mac-date-picker-title">
              {view.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              className="mac-date-picker-nav"
              aria-label={t('common.nextMonth')}
              onClick={() => setView(new Date(year, month + 1, 1))}
            >
              <ChevronRight size={14} strokeWidth={2.25} />
            </button>
          </div>
          <div className="mac-date-picker-weekdays">
            {weekdays.map((d) => (
              <span key={d} className="mac-date-picker-weekday">{d}</span>
            ))}
          </div>
          <div className="mac-date-picker-grid">
            {days.map((day, i) => {
              if (!day) return <span key={`empty-${i}`} className="mac-date-picker-day mac-date-picker-day-empty" />;
              const iso = toIsoDate(day);
              const isSelected = value === iso;
              const isToday = day.getTime() === today.getTime();
              return (
                <button
                  key={iso}
                  type="button"
                  className={`mac-date-picker-day${isSelected ? ' mac-date-picker-day-selected' : ''}${isToday ? ' mac-date-picker-day-today' : ''}`}
                  onClick={() => pick(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          {value && (
            <div className="mac-date-picker-footer">
              <button
                type="button"
                className="mac-date-picker-clear"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                {t('actions.clear')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseIsoDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const days: (Date | null)[] = Array.from({ length: startPad }, () => null);
  for (let d = 1; d <= lastDay; d++) days.push(new Date(year, month, d));
  return days;
}

export function StatusPill({ status, quiet = false }: { status: string; quiet?: boolean }) {
  const label = (status ?? '—').replace(/_/g, ' ');
  if (quiet) {
    const tones: Record<string, string> = {
      soldée: 'mac-status mac-status-ok',
      actif: 'mac-status mac-status-ok',
      active: 'mac-status mac-status-ok',
      disponible: 'mac-status mac-status-ok',
      contrôlé: 'mac-status mac-status-ok',
      paid: 'mac-status mac-status-ok',
      payé: 'mac-status mac-status-ok',
      partial: 'mac-status mac-status-warn',
      pending: 'mac-status mac-status-warn',
      en_cours: 'mac-status mac-status-warn',
      en_cours_paiement: 'mac-status mac-status-warn',
      suspendue: 'mac-status mac-status-warn',
      suspendu: 'mac-status mac-status-warn',
      réservé: 'mac-status mac-status-warn',
      en_mission: 'mac-status mac-status-warn',
      validé: 'mac-status mac-status-info',
      termine: 'mac-status mac-status-info',
      vendu: 'mac-status mac-status-info',
      signée: 'mac-status',
      brouillon: 'mac-status',
      inactif: 'mac-status',
      terminée: 'mac-status',
      en_maintenance: 'mac-status mac-status-danger',
      retourné: 'mac-status mac-status-danger',
      retard: 'mac-status mac-status-danger',
      loué: 'mac-status mac-status-info',
    };
    return <span className={`capitalize ${tones[status] || 'mac-status'}`}>{label}</span>;
  }
  const map: Record<string, string> = {
    actif: 'bg-gic-emerald-soft text-gic-emerald',
    active: 'bg-gic-emerald-soft text-gic-emerald',
    terminée: 'bg-black/[0.04] text-gic-muted',
    suspendue: 'bg-gic-amber-soft text-gic-amber',
    disponible: 'bg-gic-emerald-soft text-gic-emerald',
    soldée: 'bg-gic-emerald-soft text-gic-emerald',
    validé: 'bg-gic-violet-soft text-gic-violet',
    brouillon: 'bg-black/[0.04] text-gic-muted',
    inactif: 'bg-black/[0.04] text-gic-muted',
    termine: 'bg-gic-violet-soft text-gic-violet',
    suspendu: 'bg-gic-amber-soft text-gic-amber',
    en_cours: 'bg-gic-amber-soft text-gic-amber',
    en_cours_paiement: 'bg-gic-amber-soft text-gic-amber',
    vendu: 'bg-gic-violet-soft text-gic-violet',
    loué: 'bg-gic-pink-soft text-gic-pink',
    réservé: 'bg-gic-amber-soft text-gic-amber',
    en_maintenance: 'bg-gic-coral-soft text-gic-coral',
    en_mission: 'bg-gic-amber-soft text-gic-amber',
    retourné: 'bg-gic-coral-soft text-gic-coral',
    visé: 'bg-gic-pink-soft text-gic-pink',
    contrôlé: 'bg-gic-emerald-soft text-gic-emerald',
  };
  const cls = map[status] || 'bg-black/[0.04] text-gic-muted';
  return (
    <span className={`inline-flex items-center rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-4">
      <p className="text-[12px] text-gic-muted">{title}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
  mac = false,
  className = '',
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  mac?: boolean;
  className?: string;
}) {
  if (mac) {
    return (
      <div className={`mac-tabs${className ? ` ${className}` : ''}`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`mac-tab${active === t.id ? ' mac-tab-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-1 flex-wrap border-b border-gic-border mb-4">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors ${
            active === t.id
              ? 'border-gic-violet text-gic-violet'
              : 'border-transparent text-gic-muted hover:text-gic-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Barre combinée : sélecteur de scope (segmenté) + onglets de vue — évite deux rangées d'onglets */
export function MacToolbarTabs({
  scopeLabel,
  scopeTabs,
  scope,
  onScopeChange,
  viewTabs,
  view,
  onViewChange,
  className = '',
}: {
  scopeLabel?: string;
  scopeTabs: { id: string; label: string }[];
  scope: string;
  onScopeChange: (id: string) => void;
  viewTabs: { id: string; label: string }[];
  view: string;
  onViewChange: (id: string) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const resolvedScopeLabel = scopeLabel ?? t('fields.type');
  return (
    <div className={`mac-toolbar-tabs${className ? ` ${className}` : ''}`}>
      <div className="mac-toolbar-tabs-scope">
        <span className="mac-toolbar-tabs-label">{resolvedScopeLabel}</span>
        <div className="mac-segment-group" role="tablist" aria-label={resolvedScopeLabel}>
          {scopeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={scope === tab.id}
              className={`mac-segment${scope === tab.id ? ' mac-segment-active' : ''}`}
              onClick={() => onScopeChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mac-toolbar-tabs-views">
        <div className="mac-tabs mac-tabs-embedded">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => onViewChange(tab.id)}
              className={`mac-tab${view === tab.id ? ' mac-tab-active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TableWrap({ children, mac = false }: { children: ReactNode; mac?: boolean }) {
  if (mac) {
    return (
      <div className="overflow-x-auto mac-table-scroll">
        <table className="mac-table">{children}</table>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gic-border/70">
      <table className="w-full text-left text-[12px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  mac = false,
  className = '',
  ...rest
}: {
  children?: ReactNode;
  mac?: boolean;
  className?: string;
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  if (mac) return <th className={className} {...rest}>{children}</th>;
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-gic-muted bg-gray-50/80 border-b border-gic-border ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

type TdProps = { children: ReactNode; className?: string; mac?: boolean } & TdHTMLAttributes<HTMLTableCellElement>;

export function Td({ children, className = '', mac = false, ...rest }: TdProps) {
  if (mac) {
    return <td className={className} {...rest}>{children}</td>;
  }
  return (
    <td className={`px-3 py-2.5 border-b border-gic-border/60 align-middle ${className}`} {...rest}>
      {children}
    </td>
  );
}

export function Pagination({
  page,
  pages,
  total,
  limit,
  onPage,
  mac = false,
}: {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
  mac?: boolean;
}) {
  const { t } = useI18n();
  if (pages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  if (mac) {
    return (
      <div className="mac-pagination">
        <span className="mac-pagination-info">{t('common.rangeOf', { start: from, end: to, total })}</span>
        <div className="mac-pagination-controls">
          <button type="button" className="mac-pagination-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            {t('common.prevShort')}
          </button>
          <span className="mac-pagination-page">{page} / {pages}</span>
          <button type="button" className="mac-pagination-btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            {t('common.nextShort')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gic-border text-[11px]">
      <span className="text-gic-muted">{t('common.rangeOf', { start: from, end: to, total })}</span>
      <div className="flex gap-1">
        <Btn variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('common.prevShort')}</Btn>
        <span className="px-2 py-1.5 text-gic-muted">{t('common.pageOf', { page, pages })}</span>
        <Btn variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('common.nextShort')}</Btn>
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const maxW = size === 'lg' ? 'max-w-2xl' : 'max-w-lg';

  return createPortal(
    <div
      className="mac-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mac-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`mac-modal-dialog w-full ${maxW}`}
      >
        <div className="mac-modal-header">
          <h3 id="mac-modal-title" className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            title={t('common.close')}
            aria-label={t('common.close')}
            className="mac-modal-close"
          >
            <X size={18} strokeWidth={2.25} />
          </button>
        </div>
        <div className="mac-modal-body">{children}</div>
        {footer && (
          <div className="mac-modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
