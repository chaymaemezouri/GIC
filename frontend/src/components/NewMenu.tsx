import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus } from 'lucide-react';
import { Btn } from './ui';
import type { CreateNavGroup } from '../lib/createItems';
import { useI18n } from '../i18n/I18nContext';

type NewMenuProps = {
  groups: CreateNavGroup[];
  variant?: 'dashboard' | 'navbar';
  onOpenChange?: (open: boolean) => void;
};

function CreateMenuItems({
  groups,
  onPick,
  menuClass = 'shell-nav-menu-item w-full',
  iconClass = 'shell-nav-menu-icon',
}: {
  groups: CreateNavGroup[];
  onPick: (to: string) => void;
  menuClass?: string;
  iconClass?: string;
}) {
  const { t } = useI18n();
  return (
    <>
      {groups.map((group, groupIndex) => (
        <div key={group.id}>
          {groupIndex > 0 && <div className="shell-nav-menu-sep" aria-hidden />}
          <p className="shell-nav-menu-label">{t(group.label)}</p>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                type="button"
                role="menuitem"
                className={menuClass}
                onClick={() => onPick(item.to)}
              >
                <span className="shell-nav-menu-icon-wrap">
                  <Icon size={15} strokeWidth={1.85} className={iconClass} />
                </span>
                <span className="shell-nav-menu-item-label">{t(item.label)}</span>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

export default function NewMenu({ groups, variant = 'dashboard', onOpenChange }: NewMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const navigate = useNavigate();
  const itemCount = groups.reduce((n, g) => n + g.items.length, 0);

  function setMenuOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  function go(to: string) {
    setMenuOpen(false);
    navigate(to);
  }

  useEffect(() => {
    if (!open || variant !== 'navbar' || !btnRef.current) return;
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
  }, [open, variant]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (itemCount === 0) return null;

  if (variant === 'navbar') {
    return (
      <div ref={ref} className={`relative shrink-0${open ? ' z-[250]' : ''}`}>
        <button
          ref={btnRef}
          type="button"
          onClick={() => setMenuOpen(!open)}
          aria-expanded={open}
          title={t('common.new')}
          className={[
            'shell-nav-pill shell-nav-pill-new',
            open ? 'shell-nav-pill-open' : '',
          ].filter(Boolean).join(' ')}
        >
          <span className="shell-nav-pill-mark shell-nav-pill-mark-new">
            <Plus size={14} strokeWidth={2.5} className="shell-nav-pill-icon" />
          </span>
          <span className="shell-nav-pill-text">{t('common.new')}</span>
          <ChevronDown size={12} strokeWidth={2.25} className={`shell-nav-chevron${open ? ' rotate-180' : ''}`} />
        </button>
        {open && (
          <div
            className="shell-nav-menu shell-nav-menu-fixed shell-nav-menu-new"
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <CreateMenuItems groups={groups} onPick={go} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative${open ? ' z-50' : ''}`}>
      <Btn icon={Plus} onClick={() => setMenuOpen(!open)}>
        {t('common.new')}
        <ChevronDown size={12} className={`opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Btn>
      {open && (
        <div className="shell-dropdown shell-dropdown-right mt-0 min-w-[220px] max-h-[min(70vh,480px)] overflow-y-auto">
          <CreateMenuItems
            groups={groups}
            onPick={go}
            menuClass="shell-dropdown-item w-full"
            iconClass="text-gic-violet shrink-0"
          />
        </div>
      )}
    </div>
  );
}
