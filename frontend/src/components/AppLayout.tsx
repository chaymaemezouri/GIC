import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut, ChevronDown, User, LayoutDashboard, Menu, Languages,
} from 'lucide-react';
import UserAvatar from './UserAvatar';
import { useAuth } from '../context/AuthContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import { canAccessRoute, filterByRole, roleLabel } from '../lib/permissions';
import RoleRoute from './RoleRoute';
import PageErrorBoundary from './PageErrorBoundary';
import BackendStatusBanner from './BackendStatusBanner';
import NotificationsDropdown from './NotificationsDropdown';
import {
  navbarGroups, navbarDirectLinks, settingsNavItem, splitNavbarGroups, type NavGroup, type NavItem,
} from '../lib/navConfig';
import { resolveRail } from '../lib/sidebarPrefs';
import { filterCreateGroups } from '../lib/createItems';
import NewMenu from './NewMenu';
import EccBrandFooter from './EccBrandFooter';
import MobileNavDrawer from './MobileNavDrawer';
import { useI18n } from '../i18n/I18nContext';

function NavDirectLink({ item, accent = false }: { item: NavItem; accent?: boolean }) {
  const { t } = useI18n();
  const Icon = item.icon;
  const label = t(item.label);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={label}
      className={({ isActive }) => [
        'shell-nav-pill shell-nav-pill-direct',
        accent ? 'shell-nav-pill-accent' : '',
        isActive ? 'shell-nav-pill-active' : '',
      ].filter(Boolean).join(' ')}
    >
      <span className="shell-nav-pill-mark">
        <Icon size={14} strokeWidth={2} className="shell-nav-pill-icon" />
      </span>
      <span className="shell-nav-pill-text">{label}</span>
    </NavLink>
  );
}

function RailLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useI18n();
  const Icon = item.icon;
  const label = t(item.label);
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={label}
      onClick={onNavigate}
      className={({ isActive }) => `shell-rail-item ${isActive ? 'shell-rail-item-active' : ''}`}
    >
      <Icon size={18} strokeWidth={1.75} className="shell-rail-item-icon" />
      <span className="shell-rail-tooltip">{label}</span>
    </NavLink>
  );
}

function NavMenu({ group }: { group: NavGroup }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const location = useLocation();
  const GroupIcon = group.icon;
  const groupLabel = t(group.label);
  const groupDesc = t(group.description);

  const isActiveGroup = group.items.some((item) =>
    item.end
      ? location.pathname === item.to
      : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  );

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const updatePos = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 8, left: rect.left });
    };
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={groupLabel}
        className={[
          'shell-nav-pill',
          open ? 'shell-nav-pill-open' : '',
          isActiveGroup ? 'shell-nav-pill-active' : '',
        ].filter(Boolean).join(' ')}
      >
        <span className="shell-nav-pill-mark">
          <GroupIcon size={14} strokeWidth={2} className="shell-nav-pill-icon" />
        </span>
        <span className="shell-nav-pill-text">{groupLabel}</span>
        <ChevronDown size={12} strokeWidth={2.25} className={`shell-nav-chevron${open ? ' rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="shell-nav-menu shell-nav-menu-fixed"
          role="menu"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <div className="shell-nav-menu-head">
            <span className="shell-nav-menu-head-icon">
              <GroupIcon size={16} strokeWidth={2} />
            </span>
            <div>
              <p className="shell-nav-menu-title">{groupLabel}</p>
              <p className="shell-nav-menu-desc">{groupDesc}</p>
            </div>
          </div>
          <div className="shell-nav-menu-sep" />
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={({ isActive }) => `shell-nav-menu-item ${isActive ? 'shell-nav-menu-item-active' : ''}`}
              >
                <span className="shell-nav-menu-icon-wrap">
                  <Icon size={15} strokeWidth={1.85} className="shell-nav-menu-icon" />
                </span>
                <span className="shell-nav-menu-item-label">{t(item.label)}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserMenu({ onLogout, photoBust }: { onLogout: () => void; photoBust: number }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="shell-user-btn" aria-expanded={open}>
        <UserAvatar photo={user.photo} firstName={user.firstName} lastName={user.lastName} bust={photoBust} />
        <span className="shell-user-name hidden xl:inline">{user.firstName}</span>
        <ChevronDown size={12} strokeWidth={2.25} className={`shell-nav-chevron hidden sm:block ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="shell-dropdown shell-dropdown-right">
          <div className="shell-user-card">
            <UserAvatar photo={user.photo} firstName={user.firstName} lastName={user.lastName} className="shell-avatar shell-avatar-lg" bust={photoBust} />
            <div className="min-w-0">
              <p className="shell-user-card-name truncate">{user.firstName} {user.lastName}</p>
              <p className="shell-user-card-email truncate">{user.email}</p>
              <p className="shell-user-card-role">{roleLabel(user.role)}</p>
            </div>
          </div>
          <button type="button" className="shell-dropdown-item w-full" onClick={() => { navigate('/parametres'); setOpen(false); }}>
            <User size={14} strokeWidth={1.85} /> {t('nav.myProfile')}
          </button>
          <button type="button" className="shell-dropdown-item w-full" onClick={() => { navigate('/parametres?tab=langue'); setOpen(false); }}>
            <Languages size={14} strokeWidth={1.85} /> {t('settings.language')}
          </button>
          <div className="shell-dropdown-sep" />
          <button type="button" className="shell-dropdown-item w-full shell-dropdown-item-danger" onClick={() => { onLogout(); setOpen(false); }}>
            <LogOut size={14} strokeWidth={1.85} /> {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout, photoBust } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const rail = useMemo(
    () => (user ? resolveRail(user.role, user.sidebarPrefs) : resolveRail('SUPER_ADMIN', null)),
    [user],
  );

  const groups = useMemo(
    () =>
      user
        ? navbarGroups
            .map((g) => ({ ...g, items: filterByRole(user.role, g.items) }))
            .filter((g) => g.items.length > 0)
        : navbarGroups,
    [user],
  );

  const showSettings = user ? canAccessRoute(user.role, '/parametres') : true;

  const homeLink: NavItem = { to: '/', label: 'nav.home', icon: LayoutDashboard, end: true };
  const showHome = user ? canAccessRoute(user.role, '/') : true;

  const directLinks = useMemo(
    () => (user ? filterByRole(user.role, navbarDirectLinks) : navbarDirectLinks),
    [user],
  );

  const { primary: primaryNavGroup, rest: otherNavGroups } = useMemo(
    () => splitNavbarGroups(groups),
    [groups],
  );

  const createGroups = useMemo(
    () => (user ? filterCreateGroups(user.role) : filterCreateGroups('SUPER_ADMIN')),
    [user],
  );

  return (
    <div className="min-h-screen bg-gic-bg flex">
      <aside className="hidden lg:flex shell-rail flex-col">
        <Link to="/" className="shell-rail-brand" title="Expertise & Consulting Company">
          <img
            src="/ecc-logo.jpeg"
            alt="Expertise & Consulting Company"
            className="shell-rail-brand-logo"
            width={56}
            height={56}
          />
        </Link>
        <div className="shell-rail-divider" />
        <nav className="shell-rail-nav" aria-label={t('nav.shortcuts')}>
          {rail.map((item) => (
            <RailLink key={item.to} item={item} />
          ))}
        </nav>
        {showSettings && (
          <div className="shell-rail-footer">
            <div className="shell-rail-divider" />
            <RailLink item={settingsNavItem} />
          </div>
        )}
      </aside>
      <div className="hidden lg:block w-[68px] shrink-0 shell-rail-spacer" aria-hidden />

      <div className="flex-1 min-w-0 w-full flex flex-col shell-main-col">
        <BackendStatusBanner />
        <header className="shell-header sticky top-0 z-[100]">
          <div className="shell-header-inner">
            <div className="shell-header-start">
              <button
                type="button"
                className="shell-mobile-menu-btn"
                aria-label={t('nav.openMenu')}
                aria-expanded={mobileNavOpen}
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu size={20} strokeWidth={2} />
              </button>
              <Link to="/" className="shell-mobile-header-title">
                GIC
              </Link>
            </div>
            <div className="shell-header-center">
              <nav className="shell-nav-cluster hidden lg:flex" aria-label={t('nav.modules')}>
                {showHome && <NavDirectLink item={homeLink} />}
                {primaryNavGroup && <NavMenu group={primaryNavGroup} />}
                {otherNavGroups.map((g) => (
                  <NavMenu key={g.id} group={g} />
                ))}
              </nav>
              <div className="shell-nav-actions-wrap hidden lg:flex">
                {directLinks.map((item) => (
                  <NavDirectLink key={item.to} item={item} accent />
                ))}
                <div className="shell-nav-cluster">
                  <NewMenu groups={createGroups} variant="navbar" />
                </div>
              </div>
            </div>

            <div className="shell-header-end">
              <div className="shell-tools">
                <NotificationsDropdown />
              </div>
              <div className="shell-header-sep" aria-hidden />
              <UserMenu onLogout={logout} photoBust={photoBust} />
            </div>
          </div>
        </header>

        <MobileNavDrawer
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          rail={rail}
          homeLink={homeLink}
          showHome={showHome}
          directLinks={directLinks}
          primaryGroup={primaryNavGroup}
          groups={otherNavGroups}
          createGroups={createGroups}
          showSettings={showSettings}
          settingsNavItem={settingsNavItem}
          user={user}
          photoBust={photoBust}
          onLogout={logout}
        />

        <main className="flex-1 p-3 sm:p-5 lg:p-7 bg-gic-bg min-w-0 flex flex-col">
          <RoleRoute>
            <PageErrorBoundary key={location.pathname}>
              <Outlet />
            </PageErrorBoundary>
          </RoleRoute>
          <EccBrandFooter variant="app" />
        </main>
      </div>
    </div>
  );
}
