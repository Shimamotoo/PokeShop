export const CardLanguage = {
  PT_BR: 'PT-BR',
  EN: 'EN',
  JP: 'JP',
  ES: 'ES',
  FR: 'FR',
  DE: 'DE',
  IT: 'IT',
  KO: 'KO',
  ZH_TW: 'ZH-TW',
  ZH_CN: 'ZH-CN',
  TH: 'TH',
  ID: 'ID',
  NL: 'NL',
  RU: 'RU',
  PL: 'PL',
} as const;

export type CardLanguageType = (typeof CardLanguage)[keyof typeof CardLanguage];

export const CardLanguageLabels: Record<CardLanguageType, string> = {
  'PT-BR': 'Português (PT-BR)',
  EN: 'Inglês (EN)',
  JP: 'Japonês (JP)',
  ES: 'Espanhol (ES)',
  FR: 'Francês (FR)',
  DE: 'Alemão (DE)',
  IT: 'Italiano (IT)',
  KO: 'Coreano (KO)',
  'ZH-TW': 'Chinês Tradicional (ZH-TW)',
  'ZH-CN': 'Chinês Simplificado (ZH-CN)',
  TH: 'Tailandês (TH)',
  ID: 'Indonésio (ID)',
  NL: 'Holandês (NL)',
  RU: 'Russo (RU)',
  PL: 'Polonês (PL)',
};
