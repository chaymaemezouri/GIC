import { useEffect, useRef } from 'react';
import { Printer, X } from 'lucide-react';
import type { RowSelection } from '../hooks/useRowSelection';
import { useI18n } from '../i18n/I18nContext';

function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="mac-row-check"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
    />
  );
}

/** En-tête de colonne « tout sélectionner » pour les lignes affichées. */
export function SelectAllTh<T extends { id: string }>({ selection, rows }: { selection: RowSelection<T>; rows: T[] }) {
  const { t } = useI18n();
  const selectedHere = rows.filter((r) => selection.isSelected(r.id)).length;
  return (
    <th className="mac-th-select">
      <Checkbox
        checked={rows.length > 0 && selectedHere === rows.length}
        indeterminate={selectedHere > 0 && selectedHere < rows.length}
        onChange={() => selection.toggleAll(rows)}
        label={t('selection.selectAll')}
      />
    </th>
  );
}

/** Cellule de sélection d'une ligne (n'ouvre pas la fiche au clic). */
export function SelectTd<T extends { id: string }>({ selection, row }: { selection: RowSelection<T>; row: T }) {
  const { t } = useI18n();
  return (
    <td className="mac-td-select" onClick={(e) => e.stopPropagation()}>
      <Checkbox checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row)} label={t('selection.selectRow')} />
    </td>
  );
}

/** Barre affichée quand des lignes sont cochées : imprimer la sélection ou tout désélectionner. */
export function SelectionBar<T extends { id: string }>({
  selection,
  onPrint,
}: {
  selection: RowSelection<T>;
  onPrint: () => void;
}) {
  const { t } = useI18n();
  if (selection.count === 0) return null;
  return (
    <div className="mac-selection-bar" role="status">
      <span className="mac-selection-count">{t('selection.count', { count: selection.count })}</span>
      <button type="button" className="mac-selection-btn mac-selection-btn-primary" onClick={onPrint}>
        <Printer size={14} strokeWidth={2} />
        {t('selection.print')}
      </button>
      <button type="button" className="mac-selection-btn" onClick={selection.clear}>
        <X size={14} strokeWidth={2} />
        {t('selection.clear')}
      </button>
    </div>
  );
}
