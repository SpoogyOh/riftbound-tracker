import type { CatalogEntry } from '../types/models.js';

type PlaysetCard = Pick<CatalogEntry, 'id' | 'cardId' | 'type' | 'normal' | 'foil'>;

export function getPlaysetTarget(card: Pick<PlaysetCard, 'type'>): number {
  if (card.type === 'Rune') return 10;
  return card.type === 'Legend' || card.type === 'Battlefield' ? 1 : 3;
}

/** Runes have independent playsets per variant; other cards share a game-card playset. */
export function getPlaysetKey(card: Pick<PlaysetCard, 'id' | 'cardId' | 'type'>): string {
  return card.type === 'Rune' ? `variant:${card.id}` : `card:${card.cardId || card.id}`;
}

/** Collection counters stay per variant; normal and foil copies count together. */
export function summarizePlaysets(cards: readonly PlaysetCard[]): Map<string, { total: number; target: number }> {
  const playsets = new Map<string, { total: number; target: number }>();
  for (const card of cards) {
    const key = getPlaysetKey(card);
    const progress = playsets.get(key) ?? { total: 0, target: getPlaysetTarget(card) };
    progress.total += (card.normal || 0) + (card.foil || 0);
    playsets.set(key, progress);
  }
  return playsets;
}
