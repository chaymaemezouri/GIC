import { NavLink } from 'react-router-dom';
import type { NavItem } from '../lib/navConfig';
import { useI18n } from '../i18n/I18nContext';

const MAX_VISIBLE = 5;

type MobileBottomBarProps = {
  items: NavItem[];
};

export default function MobileBottomBar({ items }: MobileBottomBarProps) {
  const { t } = useI18n();
  const visible = items.slice(0, MAX_VISIBLE);
  if (visible.length === 0) return null;

  return (
    <nav className="shell-bottom-bar" aria-label={t('nav.shortcuts')}>
      <div className="shell-bottom-bar-inner">
        {visible.map((item) => {
          const Icon = item.icon;
          const label = t(item.label);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={label}
              className={({ isActive }) =>
                `shell-bottom-tab${isActive ? ' shell-bottom-tab-active' : ''}`
              }
            >
              <span className="shell-bottom-tab-icon">
                <Icon size={20} strokeWidth={1.85} />
              </span>
              <span className="shell-bottom-tab-label">{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
