import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../i18n/I18nContext';

type Hit = { type: string; id: string; label: string; path: string };

export default function GlobalSearch() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const id = setTimeout(() => {
      api<{ results: Hit[] }>(`/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setHits(r.results || []))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="relative w-full max-w-lg">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gic-muted" />
      <input
        className="w-full rounded-lg border border-black/10 bg-white pl-8 pr-3 py-1.5 text-[12px] outline-none focus:border-gic-violet"
        placeholder={t('common.searchEllipsis')}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && hits.length > 0 && (
        <div className="absolute z-[120] mt-1 w-full min-w-72 rounded-xl border border-black/10 bg-white shadow-lg py-1 max-h-80 overflow-auto">
          {hits.map((h) => (
            <button
              key={`${h.type}-${h.id}`}
              type="button"
              className="block w-full text-left px-3 py-2 hover:bg-black/[0.04]"
              onMouseDown={() => { navigate(h.path); setQ(''); setOpen(false); }}
            >
              <span className="block text-[12px] font-medium truncate">{h.label}</span>
              <span className="block text-[10px] text-gic-muted capitalize">{h.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
