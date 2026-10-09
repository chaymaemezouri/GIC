export type Lang = 'fr' | 'ar' | 'en';

/** Nested dictionary; leaf values are strings. Keys resolved via dot paths. */
export type Dict = { [key: string]: string | Dict };

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TranslateFn;
  isRtl: boolean;
};
