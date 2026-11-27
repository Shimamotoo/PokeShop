type RarityKind =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'double-rare'
  | 'ultra-rare'
  | 'illustration-rare'
  | 'special-illustration-rare'
  | 'hyper-rare'
  | 'special';

const STAR_PATH =
  'M6 0.8L7.52 4.18L11.2 4.56L8.45 7.04L9.22 10.65L6 8.8L2.78 10.65L3.55 7.04L0.8 4.56L4.48 4.18L6 0.8Z';

function normalizeRarity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function resolveRarityKind(rarity: string): RarityKind {
  const normalized = normalizeRarity(rarity);

  if (normalized === 'comum' || normalized === 'common') {
    return 'common';
  }
  if (normalized === 'incomum' || normalized === 'uncommon') {
    return 'uncommon';
  }
  if (normalized === 'rara' || normalized === 'rare') {
    return 'rare';
  }
  if (normalized === 'rara dupla' || normalized === 'double rare') {
    return 'double-rare';
  }
  if (normalized === 'ultra rara' || normalized === 'ultra rare') {
    return 'ultra-rare';
  }
  if (
    normalized === 'ilustracao rara especial' ||
    normalized === 'special illustration rare'
  ) {
    return 'special-illustration-rare';
  }
  if (normalized === 'ilustracao rara' || normalized === 'illustration rare') {
    return 'illustration-rare';
  }
  if (normalized.includes('hiper') || normalized.includes('hyper')) {
    return 'hyper-rare';
  }

  return 'special';
}

type RaritySymbolProps = {
  rarity: string;
  size?: 'sm' | 'md';
};

export function RaritySymbol({ rarity, size = 'sm' }: RaritySymbolProps) {
  const kind = resolveRarityKind(rarity);
  const scale = size === 'md' ? 1.18 : 1;

  if (kind === 'common') {
    const dim = Math.round(11 * scale);
    return (
      <svg
        className="rarity-symbol rarity-tone-standard"
        width={dim}
        height={dim}
        viewBox="0 0 12 12"
        aria-hidden="true"
      >
        <circle cx="6" cy="6" r="4.2" fill="currentColor" />
      </svg>
    );
  }

  if (kind === 'uncommon') {
    const dim = Math.round(11 * scale);
    return (
      <svg
        className="rarity-symbol rarity-tone-standard"
        width={dim}
        height={dim}
        viewBox="0 0 12 12"
        aria-hidden="true"
      >
        <polygon points="6,1.2 10.8,6 6,10.8 1.2,6" fill="currentColor" />
      </svg>
    );
  }

  if (kind === 'rare' || kind === 'illustration-rare' || kind === 'special') {
    const dim = Math.round(12 * scale);
    const toneClass =
      kind === 'rare' ? 'rarity-tone-rare' : 'rarity-tone-gold';
    return (
      <svg
        className={`rarity-symbol ${toneClass}`}
        width={dim}
        height={dim}
        viewBox="0 0 12 12"
        aria-hidden="true"
      >
        <path d={STAR_PATH} fill="currentColor" />
      </svg>
    );
  }

  if (
    kind === 'double-rare' ||
    kind === 'ultra-rare' ||
    kind === 'special-illustration-rare'
  ) {
    const width = Math.round(20 * scale);
    const height = Math.round(13 * scale);
    const toneClass =
      kind === 'double-rare'
        ? 'rarity-tone-rare'
        : kind === 'ultra-rare'
          ? 'rarity-tone-ultra'
          : 'rarity-tone-gold';

    return (
      <svg
        className={`rarity-symbol ${toneClass}`}
        width={width}
        height={height}
        viewBox="0 0 21 14"
        aria-hidden="true"
      >
        <g transform="translate(0, 0.2) scale(0.92)">
          <path d={STAR_PATH} fill="currentColor" />
        </g>
        <g transform="translate(9.6, 2.2) scale(0.92)">
          <path d={STAR_PATH} fill="currentColor" />
        </g>
      </svg>
    );
  }

  const width = Math.round(20 * scale);
  const height = Math.round(16 * scale);
  return (
    <svg
      className="rarity-symbol rarity-tone-gold"
      width={width}
      height={height}
      viewBox="0 0 22 18"
      aria-hidden="true"
    >
      <g transform="translate(5.5, 0) scale(0.88)">
        <path d={STAR_PATH} fill="currentColor" />
      </g>
      <g transform="translate(0.4, 7.2) scale(0.88)">
        <path d={STAR_PATH} fill="currentColor" />
      </g>
      <g transform="translate(10.6, 7.2) scale(0.88)">
        <path d={STAR_PATH} fill="currentColor" />
      </g>
    </svg>
  );
}
