export const specialSymbolCategoryIds = [
  'Popular',
  'Letters',
  'Punctuation',
  'Math',
  'Numbers',
  'Currency',
  'Symbols',
  'Hieroglyphs',
  'Arrows',
  'Emoji',
] as const;

export type SpecialSymbolCategoryId = (typeof specialSymbolCategoryIds)[number];

export interface CharacterItem {
  value: string;
  name: string;
  unicode: string;
  html: string;
}

export interface SpecialSymbolCategory {
  id: SpecialSymbolCategoryId;
  name: SpecialSymbolCategoryId;
}

export const defaultSpecialSymbolCategory: SpecialSymbolCategoryId = 'Popular';

export const specialSymbolCategories: readonly SpecialSymbolCategory[] =
  specialSymbolCategoryIds.map((id) => ({ id, name: id }));

const categoryLoaders: Record<SpecialSymbolCategoryId, () => Promise<{ default: unknown }>> = {
  Popular: () => import('./data/popular.json'),
  Letters: () => import('./data/letters.json'),
  Punctuation: () => import('./data/punctuation.json'),
  Math: () => import('./data/math.json'),
  Numbers: () => import('./data/numbers.json'),
  Currency: () => import('./data/currency.json'),
  Symbols: () => import('./data/symbols.json'),
  Hieroglyphs: () => import('./data/hieroglyphs.json'),
  Arrows: () => import('./data/arrows.json'),
  Emoji: () => import('./data/emoji.json'),
};

const loadedCategories = new Map<SpecialSymbolCategoryId, Promise<readonly CharacterItem[]>>();

function isCharacterItem(value: unknown): value is CharacterItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.value === 'string' &&
    typeof item.name === 'string' &&
    typeof item.unicode === 'string' &&
    typeof item.html === 'string'
  );
}

function parseCategoryData(
  categoryId: SpecialSymbolCategoryId,
  value: unknown,
): readonly CharacterItem[] {
  if (!Array.isArray(value) || !value.every(isCharacterItem)) {
    throw new TypeError(`${categoryId} 分类数据格式无效`);
  }
  return value;
}

export function isSpecialSymbolCategoryId(value: string): value is SpecialSymbolCategoryId {
  return specialSymbolCategoryIds.includes(value as SpecialSymbolCategoryId);
}

export function getSpecialSymbolCategoryFromHash(hash: string): SpecialSymbolCategoryId {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  return isSpecialSymbolCategoryId(value) ? value : defaultSpecialSymbolCategory;
}

export function loadSpecialSymbolCategory(
  categoryId: SpecialSymbolCategoryId,
): Promise<readonly CharacterItem[]> {
  const loaded = loadedCategories.get(categoryId);
  if (loaded) return loaded;

  const pending = categoryLoaders[categoryId]()
    .then(({ default: data }) => parseCategoryData(categoryId, data))
    .catch((error: unknown) => {
      loadedCategories.delete(categoryId);
      throw error;
    });
  loadedCategories.set(categoryId, pending);
  return pending;
}
