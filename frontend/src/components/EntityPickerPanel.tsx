import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input, StatusPill } from './ui';
import { useI18n } from '../i18n/I18nContext';

export type EntityPickerItem = {
  id: string;
  title: string;
  subtitle?: string;
  avatarLabel: string;
  photo?: string | null;
  badge?: string;
  badges?: string[];
};

const AVATAR_TONES: [string, string][] = [
  ['#ff8fb8', '#e91e8c'],
  ['#ffb347', '#f57c00'],
  ['#7dd87d', '#43a047'],
  ['#b388ff', '#7c4dff'],
  ['#ff80ab', '#c2185b'],
  ['#ffd54f', '#ffa000'],
  ['#64b5ff', '#007aff'],
  ['#80cbc4', '#00897b'],
];

export function pickerAvatarStyle(id: string): { background: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const [top, bottom] = AVATAR_TONES[h % AVATAR_TONES.length];
  return { background: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)` };
}

export function shortRefLabel(reference?: string | null, fallback = ''): string {
  const ref = reference?.trim();
  if (!ref) return fallback;
  const tail = ref.includes('-') ? ref.split('-').pop() || ref : ref;
  return tail.slice(-4).toUpperCase();
}

export type MissionFilter = 'all' | 'mission' | 'free';

export type EntityPickerPanelProps = {
  items: EntityPickerItem[];
  excludeIds?: string[] | Set<string>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  multiple?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  loading?: boolean;
  open?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  countLabel?: (count: number) => string;
  matchQuery?: (item: EntityPickerItem, rawQuery: string, tokens: string[]) => boolean;
  ariaLabel?: string;
  showMissionFilter?: boolean;
  missionFilter?: MissionFilter;
  onMissionFilterChange?: (filter: MissionFilter) => void;
};

const PAGE_SIZE = 7;

function defaultMatch(item: EntityPickerItem, _raw: string, tokens: string[]): boolean {
  const blob = `${item.title} ${item.subtitle || ''} ${item.badge || ''} ${(item.badges || []).join(' ')}`.toLowerCase();
  return tokens.every((tok) => blob.includes(tok));
}

export function EntityPickerPanel({
  items,
  excludeIds,
  selectedId = null,
  onSelect,
  multiple = false,
  selectedIds = [],
  onToggleSelect,
  query,
  onQueryChange,
  loading = false,
  open = true,
  searchPlaceholder,
  emptyMessage,
  countLabel,
  matchQuery = defaultMatch,
  ariaLabel,
  showMissionFilter = false,
  missionFilter = 'all',
  onMissionFilterChange,
}: EntityPickerPanelProps) {
  const { t } = useI18n();
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('fields.filterNameRefEmail');
  const resolvedEmptyMessage = emptyMessage ?? t('msg.emptyItemsAvailable');
  const resolvedCountLabel = countLabel ?? ((n: number) => t('msg.itemsAvailable', { count: n }));
  const resolvedAriaLabel = ariaLabel ?? t('common.selection');
  const [page, setPage] = useState(1);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const excluded = useMemo(() => {
    if (!excludeIds) return new Set<string>();
    return excludeIds instanceof Set ? excludeIds : new Set(excludeIds);
  }, [excludeIds]);

  const filtered = useMemo(() => {
    const raw = query.trim();
    const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (excluded.has(item.id)) return false;
      if (showMissionFilter) {
        const onMission = item.badge === 'en_mission';
        if (missionFilter === 'mission' && !onMission) return false;
        if (missionFilter === 'free' && onMission) return false;
      }
      if (!tokens.length) return true;
      return matchQuery(item, raw, tokens);
    });
  }, [items, excluded, query, matchQuery, showMissionFilter, missionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = filtered.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length);

  useEffect(() => {
    if (!open) {
      setPage(1);
      return;
    }
    setPage(1);
  }, [open, query, missionFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function handleItemClick(id: string) {
    if (multiple) {
      onToggleSelect?.(id);
      return;
    }
    onSelect?.(id);
  }

  function isSelected(id: string) {
    return multiple ? selectedSet.has(id) : selectedId === id;
  }

  return (
    <div className="mac-client-picker-panel">
      <div className="mac-client-picker-head">
        <div className="flex-1 min-w-0">
          <Input
            icon={Search}
            placeholder={resolvedSearchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="mac-client-picker-search"
          />
        </div>
      </div>
      {showMissionFilter && onMissionFilterChange && (
        <div className="entity-picker-filters">
          {([
            ['all', t('common.all')],
            ['mission', t('fields.onMission')],
            ['free', t('common.availablePlural')],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`entity-picker-filter${missionFilter === value ? ' entity-picker-filter-active' : ''}`}
              onClick={() => onMissionFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {multiple && selectedIds.length > 0 && (
        <p className="entity-picker-selected-count">{t('msg.workersSelected', { count: selectedIds.length })}</p>
      )}
      {loading ? (
        <p className="mac-client-picker-meta">{t('common.loading')}</p>
      ) : (
        <p className="mac-client-picker-meta">{resolvedCountLabel(filtered.length)}</p>
      )}
      {loading ? null : filtered.length === 0 ? (
        <p className="mac-client-picker-empty">{resolvedEmptyMessage}</p>
      ) : (
        <div className="mac-client-picker-list-wrap">
          <div className="mac-client-picker-list" role="listbox" aria-label={resolvedAriaLabel} aria-multiselectable={multiple || undefined}>
            {pageItems.map((item) => {
              const selected = isSelected(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`mac-client-picker-row${selected ? ' mac-client-picker-row-selected' : ''}`}
                  onClick={() => handleItemClick(item.id)}
                >
                  <div className="mac-client-picker-row-main">
                    {item.photo ? (
                      <img src={item.photo} alt="" className="mac-avatar shrink-0" />
                    ) : (
                      <span className="mac-avatar-fallback shrink-0" style={pickerAvatarStyle(item.id)}>
                        {item.avatarLabel}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="mac-row-title truncate">{item.title}</p>
                      {item.subtitle ? (
                        <p className="mac-row-subtitle truncate">{item.subtitle}</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mac-client-picker-row-end">
                    {item.badges?.length ? (
                      <div className="flex flex-wrap justify-end gap-1">
                        {item.badges.map((b) => <StatusPill key={b} status={b} quiet />)}
                      </div>
                    ) : item.badge ? (
                      <StatusPill status={item.badge} quiet />
                    ) : null}
                    <span
                      className={`mac-client-picker-radio${selected ? ' mac-client-picker-radio-on' : ''}${multiple ? ' mac-client-picker-check' : ''}`}
                      aria-hidden
                    />
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mac-pagination">
            <span className="mac-pagination-info">
              {t('common.rangeOf', { start: rangeStart, end: rangeEnd, total: filtered.length })}
            </span>
            <div className="mac-pagination-controls">
              <button
                type="button"
                className="mac-pagination-btn"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('common.prevShort')}
              </button>
              <span className="mac-pagination-page">{safePage} / {totalPages}</span>
              <button
                type="button"
                className="mac-pagination-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {t('common.nextShort')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function workforceToPickerItem(w: {
  id: string;
  reference?: string | null;
  firstName: string;
  lastName: string;
  cin?: string | null;
  category?: string | null;
  phone1?: string | null;
  photo?: string | null;
  assignments?: Array<{ chantier?: { name?: string } }>;
}): EntityPickerItem {
  const ref = w.reference?.trim() || '';
  const avatarLabel = shortRefLabel(ref, `${w.firstName[0] || ''}${w.lastName[0] || ''}`);
  const subtitleParts = [ref || w.cin, w.category || w.phone1].filter(Boolean);
  const assigned = (w.assignments?.length ?? 0) > 0;
  return {
    id: w.id,
    title: `${w.firstName} ${w.lastName}`,
    subtitle: subtitleParts.join(' · '),
    avatarLabel,
    photo: w.photo,
    badge: assigned ? 'en_mission' : 'disponible',
  };
}

export function chantierToPickerItem(c: {
  id: string;
  name: string;
  reference?: string | null;
  address?: string | null;
  status?: string | null;
  progressPct?: number | null;
  project?: { name?: string } | null;
}): EntityPickerItem {
  const ref = c.reference?.trim() || '';
  const subtitleParts = [
    ref,
    c.address || c.project?.name,
    c.progressPct != null ? `${c.progressPct}%` : null,
  ].filter(Boolean);
  return {
    id: c.id,
    title: c.name,
    subtitle: subtitleParts.join(' · '),
    avatarLabel: shortRefLabel(ref, c.name.slice(0, 2).toUpperCase()),
    badge: c.status || undefined,
  };
}

export function clientToPickerItem(c: {
  id: string;
  reference?: string | null;
  photo?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone1?: string | null;
  identityNumber?: string | null;
  isProspect?: boolean;
  isBuyer?: boolean;
  isTenant?: boolean;
}): EntityPickerItem {
  const badges: string[] = [];
  if (c.isProspect) badges.push('brouillon');
  if (c.isBuyer) badges.push('actif');
  if (c.isTenant) badges.push('loué');
  return {
    id: c.id,
    title: `${c.firstName} ${c.lastName}`,
    subtitle: [c.reference, c.email || c.phone1].filter(Boolean).join(' · '),
    avatarLabel: shortRefLabel(c.reference, `${c.firstName[0] || ''}${c.lastName[0] || ''}`),
    photo: c.photo,
    badges,
  };
}

export function mandantToPickerItem(m: {
  id: string;
  reference?: string | null;
  photo?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone1?: string | null;
  identityNumber?: string | null;
  identityType?: string | null;
}): EntityPickerItem {
  const subtitleParts = [
    m.reference,
    m.email || m.phone1,
    m.identityType,
    m.identityNumber,
  ].filter(Boolean);
  return {
    id: m.id,
    title: `${m.firstName} ${m.lastName}`,
    subtitle: subtitleParts.join(' · '),
    avatarLabel: shortRefLabel(m.reference, `${m.firstName[0] || ''}${m.lastName[0] || ''}`),
    photo: m.photo,
  };
}

export function enginToPickerItem(e: {
  id: string;
  brand?: string | null;
  matricule?: string | null;
  genre?: string | null;
  status?: string | null;
  photo?: string | null;
}): EntityPickerItem {
  const title = [e.brand, e.matricule].filter(Boolean).join(' — ') || 'Engin';
  const subtitle = [e.matricule, e.genre].filter(Boolean).join(' · ');
  return {
    id: e.id,
    title,
    subtitle,
    avatarLabel: (e.matricule?.slice(-3) || e.brand?.slice(0, 3) || 'EN').toUpperCase(),
    photo: e.photo,
    badge: e.status || undefined,
  };
}
