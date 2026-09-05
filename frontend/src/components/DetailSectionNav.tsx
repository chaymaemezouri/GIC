import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FileText } from 'lucide-react';

export type DetailNavItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
};

export type DetailNavGroup = {
  id: string;
  /** Omit or leave empty for a flat list without section heading */
  label?: string;
  items: DetailNavItem[];
};

type Props = {
  active: string;
  onChange: (id: string) => void;
  /** Grouped sections (preferred for many items) */
  groups?: DetailNavGroup[];
  /** Flat items — rendered as one untitled group */
  items?: DetailNavItem[];
  ariaLabel?: string;
};

/** Vertical section nav — same visual language as chantier detail. */
export default function DetailSectionNav({
  active,
  onChange,
  groups,
  items,
  ariaLabel = 'Sections',
}: Props) {
  const resolved: DetailNavGroup[] =
    groups && groups.length > 0
      ? groups
      : [{ id: 'main', items: items || [] }];

  return (
    <nav className="detail-section-nav" aria-label={ariaLabel}>
      {resolved.map((group) => (
        <div key={group.id} className="detail-section-nav-group">
          {group.label ? (
            <p className="detail-section-nav-heading">{group.label}</p>
          ) : null}
          <ul className="detail-section-nav-list">
            {group.items.map((item) => {
              const Icon = item.icon || FileText;
              const isActive = active === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`detail-section-nav-item${isActive ? ' detail-section-nav-item-active' : ''}`}
                    onClick={() => onChange(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon size={15} strokeWidth={2} className="detail-section-nav-icon" />
                    <span className="detail-section-nav-label">{item.label}</span>
                    {item.badge != null && item.badge !== '' && item.badge !== 0 && (
                      <span className="detail-section-nav-badge">{item.badge}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Layout: sticky vertical nav + content panel */
export function DetailShell({
  nav,
  children,
  className = '',
}: {
  nav: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`detail-section-shell${className ? ` ${className}` : ''}`}>
      {nav}
      <div className="detail-section-panel">{children}</div>
    </div>
  );
}
