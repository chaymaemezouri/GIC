import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut, User, X } from 'lucide-react';
import type { NavGroup, NavItem } from '../lib/navConfig';
import type { CreateNavGroup } from '../lib/createItems';
import UserAvatar from './UserAvatar';
import { useI18n } from '../i18n/I18nContext';

type MobileNavDrawerProps = {
  open: boolean;
  onClose: () => void;
  rail: NavItem[];
  homeLink: NavItem;
  showHome: boolean;
  directLinks: NavItem[];
  primaryGroup: NavGroup | null;
  groups: NavGroup[];
  createGroups: CreateNavGroup[];
  showSettings: boolean;
  settingsNavItem: NavItem;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    photo?: string | null;
    role: string;
  } | null;
  photoBust: number;
  onLogout: () => void;
};

function DrawerLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `shell-mobile-link${isActive ? ' shell-mobile-link-active' : ''}`
      }
    >
      <span className="shell-mobile-link-icon">
        <Icon size={18} strokeWidth={1.85} />
      </span>
      <span>{t(item.label)}</span>
    </NavLink>
  );
}

export default function MobileNavDrawer({
  open,
  onClose,
  rail,
  homeLink,
  showHome,
  directLinks,
  primaryGroup,
  groups,
  createGroups,
  showSettings,
  settingsNavItem,
  user,
  photoBust,
  onLogout,
}: MobileNavDrawerProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="shell-mobile-root" role="dialog" aria-modal="true" aria-label={t('nav.navigation')}>
      <button type="button" className="shell-mobile-backdrop" aria-label={t('nav.closeMenu')} onClick={onClose} />
      <aside className="shell-mobile-drawer">
        <div className="shell-mobile-drawer-head">
          <Link to="/" className="shell-mobile-brand" onClick={onClose}>
            <img src="/ecc-logo.jpeg" alt="GIC" className="shell-mobile-brand-logo" />
            <div className="min-w-0">
              <p className="shell-mobile-brand-title">GIC</p>
              <p className="shell-mobile-brand-sub">{t('auth.subtitle')}</p>
            </div>
          </Link>
          <button type="button" className="shell-mobile-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        <nav className="shell-mobile-nav">
          {rail.length > 0 && (
            <section className="shell-mobile-section-block">
              <p className="shell-mobile-section">{t('nav.shortcuts')}</p>
              {rail.map((item) => (
                <DrawerLink key={`rail-${item.to}`} item={item} onNavigate={onClose} />
              ))}
            </section>
          )}

          <section className="shell-mobile-section-block">
            <p className="shell-mobile-section">{t('nav.navigation')}</p>
            {showHome && <DrawerLink item={homeLink} onNavigate={onClose} />}
            {primaryGroup && (
              <div className="shell-mobile-group">
                <p className="shell-mobile-group-label">{t(primaryGroup.label)}</p>
                {primaryGroup.items.map((item) => (
                  <DrawerLink key={item.to} item={item} onNavigate={onClose} />
                ))}
              </div>
            )}
            {directLinks.map((item) => (
              <DrawerLink key={item.to} item={item} onNavigate={onClose} />
            ))}
            {groups.map((group) => (
              <div key={group.id} className="shell-mobile-group">
                <p className="shell-mobile-group-label">{t(group.label)}</p>
                {group.items.map((item) => (
                  <DrawerLink key={item.to} item={item} onNavigate={onClose} />
                ))}
              </div>
            ))}
          </section>

          {createGroups.length > 0 && (
            <section className="shell-mobile-section-block">
              <p className="shell-mobile-section">{t('nav.create')}</p>
              {createGroups.map((group) => (
                <div key={group.id} className="shell-mobile-group">
                  <p className="shell-mobile-group-label">{t(group.label)}</p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="shell-mobile-link shell-mobile-link-create"
                        onClick={onClose}
                      >
                        <span className="shell-mobile-link-icon shell-mobile-link-icon-create">
                          <Icon size={16} strokeWidth={2} />
                        </span>
                        <span>{t(item.label)}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </section>
          )}

          {showSettings && (
            <section className="shell-mobile-section-block">
              <DrawerLink item={settingsNavItem} onNavigate={onClose} />
            </section>
          )}
        </nav>

        {user && (
          <div className="shell-mobile-drawer-foot">
            <Link to="/parametres" className="shell-mobile-user" onClick={onClose}>
              <UserAvatar
                photo={user.photo}
                firstName={user.firstName}
                lastName={user.lastName}
                bust={photoBust}
              />
              <div className="min-w-0">
                <p className="shell-mobile-user-name truncate">{user.firstName} {user.lastName}</p>
                <p className="shell-mobile-user-email truncate">{user.email}</p>
              </div>
              <User size={16} className="shrink-0 text-gic-muted" />
            </Link>
            <button type="button" className="shell-mobile-logout" onClick={() => { onLogout(); onClose(); }}>
              <LogOut size={16} strokeWidth={1.85} />
              {t('auth.logout')}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
