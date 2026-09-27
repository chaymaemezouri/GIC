import { useCallback, useMemo, useState } from 'react';

export type RowSelection<T> = {
  count: number;
  rows: T[];
  isSelected: (id: string) => boolean;
  toggle: (row: T) => void;
  /** Coche toutes les lignes données, ou les décoche si elles le sont déjà toutes. */
  toggleAll: (rows: T[]) => void;
  clear: () => void;
};

/** Sélection de lignes conservée d'une page à l'autre (clé : `id`). */
export function useRowSelection<T extends { id: string }>(): RowSelection<T> {
  const [selected, setSelected] = useState<Map<string, T>>(() => new Map());

  const toggle = useCallback((row: T) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });
  }, []);

  const toggleAll = useCallback((rows: T[]) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const all = rows.length > 0 && rows.every((r) => next.has(r.id));
      for (const r of rows) {
        if (all) next.delete(r.id);
        else next.set(r.id, r);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Map()), []);

  return useMemo(
    () => ({
      count: selected.size,
      rows: [...selected.values()],
      isSelected: (id: string) => selected.has(id),
      toggle,
      toggleAll,
      clear,
    }),
    [selected, toggle, toggleAll, clear],
  );
}
