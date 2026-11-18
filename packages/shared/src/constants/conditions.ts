export const CardCondition = {
  PERFEITO_ESTADO: 'PERFEITO_ESTADO',     // Mint / Near Mint
  POUCO_USADA: 'POUCO_USADA',             // Lightly Played / Excellent
  MARCAS_DE_USO: 'MARCAS_DE_USO',         // Played / Good
  DANIFICADA: 'DANIFICADA',               // Damaged / Poor
} as const;

export type CardConditionType = typeof CardCondition[keyof typeof CardCondition];

export const CardConditionLabels: Record<CardConditionType, string> = {
  PERFEITO_ESTADO: 'Novo / Perfeito estado',
  POUCO_USADA: 'Pouco usada / Ótimo estado',
  MARCAS_DE_USO: 'Marcas de uso / Bom estado',
  DANIFICADA: 'Danificada',
};
