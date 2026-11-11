import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { printWithCompany } from '../lib/companyPrint';
import { joinPrintSections, type PrintSection } from '../lib/printBlocks';
import { Btn, Modal } from './ui';

export function PrintChoiceModal({
  open,
  title,
  sections,
  onClose,
}: {
  open: boolean;
  title: string;
  sections: PrintSection[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string[] | null>(null);
  const ids = sections.map((section) => section.id).join('|');
  const picked = selected ?? sections.map((section) => section.id);

  useEffect(() => {
    if (open) setSelected(null);
  }, [open, ids]);

  const all = sections.length > 0 && picked.length === sections.length;
  const chosen = useMemo(
    () => sections.filter((section) => picked.includes(section.id)),
    [sections, picked],
  );

  function toggle(id: string) {
    setSelected(picked.includes(id) ? picked.filter((item) => item !== id) : [...picked, id]);
  }

  function printChosen() {
    if (!chosen.length) return;
    void printWithCompany({
      title,
      bodyHtml: joinPrintSections(chosen),
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      title={t('msg.printChooseTitle')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Btn type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn type="button" disabled={!chosen.length} onClick={printChosen}>
            {t('common.print')} ({chosen.length})
          </Btn>
        </>
      }
    >
      <p className="text-[12px] text-gic-muted mb-3">{t('msg.printChooseHint')}</p>
      <label className="flex items-center gap-2 text-[13px] font-medium text-gic-ink mb-3">
        <input
          type="checkbox"
          checked={all}
          onChange={() => setSelected(all ? [] : sections.map((section) => section.id))}
        />
        {t('msg.printSelectAll')}
      </label>
      <div className="space-y-2 max-h-[55vh] overflow-y-auto">
        {sections.map((section) => (
          <label key={section.id} className="flex items-start gap-2 rounded-xl border border-gic-border px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={picked.includes(section.id)}
              onChange={() => toggle(section.id)}
            />
            <span className="min-w-0">
              <span className="block text-[13px] text-gic-ink">{section.label}</span>
              {section.hint && <span className="block text-[11px] text-gic-muted">{section.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
