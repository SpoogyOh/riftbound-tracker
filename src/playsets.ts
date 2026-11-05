import type { CatalogEntry } from '../types/models.js';

type PlaysetCard = Pick<CatalogEntry, 'id' | 'cardId' | 'type' | 'normal' | 'foil'>;

export function getPlaysetTarget(card: Pick<PlaysetCard, 'type'>): number {
  return card.type === 'Legend' || card.type === 'Battlefield' ? 1 : 3;
}

/** Collection counters stay per variant; playsets span the underlying game card. */
export function summarizePlaysets(cards: readonly PlaysetCard[]): Map<string, { total: number; target: number }> {
  const playsets = new Map<string, { total: number; target: number }>();
  for (const card of cards) {
    const key = card.cardId || card.id;
    const progress = playsets.get(key) ?? { total: 0, target: getPlaysetTarget(card) };
    progress.total += (card.normal || 0) + (card.foil || 0);
    playsets.set(key, progress);
  }
  return playsets;
}
