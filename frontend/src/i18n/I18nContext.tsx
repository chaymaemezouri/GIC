import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Dict, I18nContextValue, Lang, TranslateFn } from './types';
import fr from './fr';
import ar from './ar';

const STORAGE_KEY = 'gic_lang';
const dictionaries: Record<Lang, Dict> = { fr, ar };

function readStoredLang(): Lang {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'ar' || raw === 'fr') return raw;
  } catch {
    /* ignore */
  }
  return 'fr';
}

function getByPath(dict: Dict, path: string): string | undefined {
  const parts = path.split('.');
  let cur: string | Dict | undefined = dict;
  for (const part of parts) {
    if (cur == null || typeof cur === 'string') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] != null ? String(params[key]) : `{{${key}}}`,
  );
}

function applyDocumentLang(lang: Lang) {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'fr';
    const initial = readStoredLang();
    applyDocumentLang(initial);
    return initial;
  });

  useEffect(() => {
    applyDocumentLang(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    applyDocumentLang(next);
  }, []);

  const t: TranslateFn = useCallback(
    (key, params) => {
      const fromActive = getByPath(dictionaries[lang], key);
      if (fromActive != null) return interpolate(fromActive, params);
      const fromFr = getByPath(dictionaries.fr, key);
      if (fromFr != null) return interpolate(fromFr, params);
      return key;
    },
    [lang],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t,
      isRtl: lang === 'ar',
    }),
    [lang, setLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Translate using the stored language (for non-React helpers / print). */
export const tStatic: TranslateFn = (key, params) => {
  const lang = typeof window !== 'undefined' ? readStoredLang() : 'fr';
  const fromActive = getByPath(dictionaries[lang], key);
  if (fromActive != null) return interpolate(fromActive, params);
  const fromFr = getByPath(dictionaries.fr, key);
  if (fromFr != null) return interpolate(fromFr, params);
  return key;
};
