import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function BackendStatusBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!cancelled) setOffline(!res.ok);
      } catch {
        if (!cancelled) setOffline(true);
      }
    }

    ping();
    const id = setInterval(ping, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="bg-gic-coral text-white px-4 py-2 text-[11px] flex items-center justify-center gap-2 shrink-0">
      <AlertTriangle size={14} />
      <span>
        Serveur GIC injoignable — lancez <code className="bg-white/15 px-1.5 py-0.5 rounded">npm run dev</code> à la racine du projet
      </span>
    </div>
  );
}
