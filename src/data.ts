export const CATEGORY_ORDER = [
  '港式/茶餐廳',
  '粵菜/海鮮',
  '粉麵/米線',
  '西式/咖啡店',
  '甜品/冰品',
  '日本菜',
  '快餐/連鎖',
  '泰國菜',
  '川菜/中菜',
  '火鍋',
  '韓國菜',
  '台灣菜',
  '其他（東南亞／南亞等）',
] as const;

export const FEATURED_STREETS = ['青山道', '元州街', '順寧道', '保安道'] as const;

export const STREETS = [
  '青山道',
  '元州街',
  '順寧道',
  '保安道',
  '東京街',
  '昌華街',
  '福榮街',
  '長沙灣道',
  '永隆街',
  '長發街',
  '幸祥街',
  '東沙島街',
  '福華街',
  '荔盈街',
  '發祥街',
  '荔枝角道',
  '集輝街',
  '營盤街',
  '瓊林街',
  '興華街',
  '永康街',
] as const;

export const PRICE_BANDS = ['$50以下', '$51-100', '$101-200', '$201-400'] as const;

export const DATA_AS_OF = '2026年10月27日';

const STREET_FIXES: readonly (readonly [string, string])[] = [
  ['元洲街', '元州街'],
  ['順寕道', '順寧道'],
  ['茘盈街', '荔盈街'],
  ['褔華街', '福華街'],
];

export type SortKey = 'score' | 'category' | 'name';
export type Scope = 'all' | 'been' | 'dislike';
export type PickPool = 'all' | 'filters' | 'saved';
export type MarkAction = 'been' | 'dislike' | 'clear';

export interface Restaurant {
  id: string;
  name: string;
  address: string;
  price: string;
  score: number | null;
  cuisines: string[];
  dishes: string[];
  url: string;
  source: string;
  category: string;
  order: number;
}

export interface ListRoute {
  view: 'list';
  cat: string | null;
  q: string;
  sort: SortKey;
  price: string[];
  street: string | null;
  scope: Scope;
}

export interface DetailRoute {
  view: 'detail';
  id: string;
}

export type Route = ListRoute | DetailRoute;

export interface Marks {
  been: string[];
  dislike: string[];
  lastPick: string | null;
}

export interface PickResult {
  restaurant: Restaurant | null;
  avoided: boolean;
  onlyChoice: boolean;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESC[ch] ?? ch);
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatScore(score: number | null): string {
  if (score == null || Number.isNaN(score)) return '暫無評分';
  const rounded = Math.round(score * 100) / 100;
  return String(rounded);
}

export function scoreText(score: number | null): string {
  if (score == null || Number.isNaN(score)) return '暫無評分';
  return `評分 ${formatScore(score)}`;
}

export function categoryAliases(category: string): Set<string> {
  const aliases = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) aliases.add(trimmed);
  };
  add(category);
  add(shortCategory(category));
  for (const part of category.split(/[/／]/)) add(part);
  return aliases;
}

/** Category, extra cuisines (duplicates removed), price, and a labelled score. */
export function listMetaParts(restaurant: Restaurant): string[] {
  const seen = categoryAliases(restaurant.category);
  const tags = [restaurant.category];
  for (const cuisine of restaurant.cuisines) {
    const label = cuisine.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    tags.push(label);
  }
  tags.push(restaurant.price);
  tags.push(scoreText(restaurant.score));
  return tags;
}

export function shortCategory(category: string): string {
  const cut = category.split(/[/（]/)[0];
  return cut || category;
}

export function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch {
    return null;
  }
  return null;
}

export function lede(restaurant: Restaurant): string {
  const sentence = `${restaurant.address}。價錢 ${restaurant.price}，${scoreText(restaurant.score)}。`;
  if (restaurant.dishes.length === 0) return sentence;
  return `${sentence}菜式：${restaurant.dishes.join('、')}。`;
}

export function emptyMarks(): Marks {
  return { been: [], dislike: [], lastPick: null };
}

function idList(item: unknown): string[] {
  if (!Array.isArray(item)) return [];
  const ids = item.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
  return [...new Set(ids)];
}

/** Old 「鐘意」 (`like`) becomes 「食開」. `like` is not kept. Dislike wins if an id is in both. */
export function normalizeMarks(value: unknown): Marks {
  if (!value || typeof value !== 'object') return emptyMarks();
  const record = value as Record<string, unknown>;
  const like = idList(record.like);
  const been = new Set([...idList(record.been), ...like]);
  const dislike = idList(record.dislike);
  for (const id of dislike) been.delete(id);
  const last = record.lastPick;
  return {
    been: [...been],
    dislike,
    lastPick: typeof last === 'string' && last.trim() ? last : null,
  };
}

export function marksHaveLegacyLike(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'like' in value);
}

export function applyMark(marks: Marks, action: MarkAction, id: string): Marks {
  if (action === 'been') {
    const on = marks.been.includes(id);
    return {
      ...marks,
      been: on ? marks.been.filter((item) => item !== id) : [...marks.been, id],
      dislike: on ? marks.dislike : marks.dislike.filter((item) => item !== id),
    };
  }
  if (action === 'dislike') {
    const on = marks.dislike.includes(id);
    return {
      ...marks,
      dislike: on ? marks.dislike.filter((item) => item !== id) : [...marks.dislike, id],
      been: on ? marks.been : marks.been.filter((item) => item !== id),
    };
  }
  return { ...marks, dislike: marks.dislike.filter((item) => item !== id) };
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function streetOf(address: string): string | null {
  let text = address;
  for (const [from, to] of STREET_FIXES) text = text.replaceAll(from, to);
  let found: { name: string; at: number } | null = null;
  for (const name of STREETS) {
    const at = text.indexOf(name);
    if (at < 0) continue;
    if (!found || at < found.at || (at === found.at && name.length > found.name.length)) {
      found = { name, at };
    }
  }
  return found?.name ?? null;
}

export function defaultList(): ListRoute {
  return {
    view: 'list',
    cat: null,
    q: '',
    sort: 'score',
    price: [],
    street: null,
    scope: 'all',
  };
}

export function isDefaultList(route: ListRoute): boolean {
  return (
    route.cat === null &&
    route.q.trim() === '' &&
    route.sort === 'score' &&
    route.price.length === 0 &&
    route.street === null &&
    route.scope === 'all'
  );
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label}格式不正確`);
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function idFromUrl(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? url;
  } catch {
    return url;
  }
}

function uniqueId(base: string, seen: Map<string, number>): string {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function toRestaurant(row: unknown, category: string, order: number, seen: Map<string, number>): Restaurant {
  if (!row || typeof row !== 'object') {
    throw new Error(`分類「${category}」有一筆資料格式不正確`);
  }
  const record = row as Record<string, unknown>;
  const name = asString(record.name);
  const address = asString(record.address);
  const price = asString(record.price);
  const url = asString(record.url);
  const source = asString(record.source);
  if (!name || address == null || price == null || !url || source == null) {
    throw new Error(`分類「${category}」有食店缺少必要欄位`);
  }
  if (typeof record.score !== 'number' && record.score !== null) {
    throw new Error(`「${name}」的評分格式不正確`);
  }
  return {
    id: uniqueId(idFromUrl(url), seen),
    name,
    address,
    price,
    score: record.score,
    cuisines: asStringList(record.cuisines, `「${name}」的菜式`),
    dishes: asStringList(record.dishes, `「${name}」的菜色`),
    url,
    source,
    category,
    order,
  };
}

export async function loadRestaurants(): Promise<Restaurant[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}csw_categorized.json`);
  if (!response.ok) throw new Error(`無法載入食店資料（${response.status}）`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('食店資料格式不正確');
  }
  const record = payload as Record<string, unknown>;
  const categories = [
    ...CATEGORY_ORDER.filter((category) => category in record),
    ...Object.keys(record).filter((category) => !(CATEGORY_ORDER as readonly string[]).includes(category)),
  ];
  const seen = new Map<string, number>();
  const list: Restaurant[] = [];
  for (const category of categories) {
    const rows = record[category];
    if (!Array.isArray(rows)) throw new Error(`分類「${category}」格式不正確`);
    for (const row of rows) list.push(toRestaurant(row, category, list.length, seen));
  }
  return list;
}

export function categoriesIn(restaurants: Restaurant[]): string[] {
  const present = new Set(restaurants.map((restaurant) => restaurant.category));
  const extras = [...present].filter((category) => !(CATEGORY_ORDER as readonly string[]).includes(category));
  return [...CATEGORY_ORDER.filter((category) => present.has(category)), ...extras];
}

export function matches(restaurant: Restaurant, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    restaurant.name,
    restaurant.address,
    restaurant.category,
    restaurant.price,
    restaurant.source,
    ...restaurant.cuisines,
    ...restaurant.dishes,
  ]
    .join('\n')
    .toLowerCase();
  return needle.split(/[\s\u3000]+/).every((part) => haystack.includes(part));
}

export function matchesFilters(restaurant: Restaurant, route: ListRoute, marks: Marks): boolean {
  if (route.cat && restaurant.category !== route.cat) return false;
  if (route.price.length > 0 && !route.price.includes(restaurant.price)) return false;
  if (route.street && streetOf(restaurant.address) !== route.street) return false;
  if (route.scope === 'been' && !marks.been.includes(restaurant.id)) return false;
  if (route.scope === 'dislike' && !marks.dislike.includes(restaurant.id)) return false;
  return matches(restaurant, route.q);
}

function scoreValue(score: number | null): number {
  return score == null ? Number.NEGATIVE_INFINITY : score;
}

export function sortRestaurants(rows: Restaurant[], sort: SortKey): Restaurant[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === 'name') {
      const byName = a.name.localeCompare(b.name, 'zh-Hant');
      return byName !== 0 ? byName : a.order - b.order;
    }
    if (sort === 'category') return a.order - b.order;
    const byScore = scoreValue(b.score) - scoreValue(a.score);
    return byScore !== 0 ? byScore : a.order - b.order;
  });
  return copy;
}

export function filterAndSort(restaurants: Restaurant[], route: ListRoute, marks: Marks): Restaurant[] {
  return sortRestaurants(
    restaurants.filter((restaurant) => matchesFilters(restaurant, route, marks)),
    route.sort,
  );
}

/** Full sort order, then 唔鐘意 rows sink to the bottom without changing their relative order. */
export function arrangeList(restaurants: Restaurant[], route: ListRoute, marks: Marks): Restaurant[] {
  const sorted = filterAndSort(restaurants, route, marks);
  const open: Restaurant[] = [];
  const collapsed: Restaurant[] = [];
  for (const restaurant of sorted) {
    if (marks.dislike.includes(restaurant.id)) collapsed.push(restaurant);
    else open.push(restaurant);
  }
  return [...open, ...collapsed];
}

export function countMatches(restaurants: Restaurant[], route: ListRoute, marks: Marks): number {
  return restaurants.filter((restaurant) => matchesFilters(restaurant, route, marks)).length;
}

export function pickRestaurant(
  pool: readonly Restaurant[],
  excludeId: string | null,
  random: () => number = Math.random,
): PickResult {
  if (pool.length === 0) return { restaurant: null, avoided: false, onlyChoice: false };
  const rest = excludeId ? pool.filter((item) => item.id !== excludeId) : pool;
  if (rest.length === 0) return { restaurant: pool[0] ?? null, avoided: false, onlyChoice: true };
  const raw = Math.floor(random() * rest.length);
  const index = Math.min(rest.length - 1, Math.max(0, raw));
  const avoided = Boolean(excludeId && pool.some((item) => item.id === excludeId));
  return { restaurant: rest[index] ?? null, avoided, onlyChoice: false };
}

export function neighbors(
  restaurants: Restaurant[],
  restaurant: Restaurant,
): { prev: Restaurant | null; next: Restaurant | null } {
  const group = restaurants.filter((item) => item.category === restaurant.category);
  const index = group.findIndex((item) => item.id === restaurant.id);
  return {
    prev: index > 0 ? (group[index - 1] ?? null) : null,
    next: index >= 0 ? (group[index + 1] ?? null) : null,
  };
}

export function footerText(total: number): string {
  return `長沙灣食店目錄收錄 OpenRice 標示為長沙灣的食店，資料截取日期 ${DATA_AS_OF}，共 ${total} 間，按主要菜式分類。本站只是靜態索引，並非 OpenRice 或店家官方網站。店名、地址、價錢同評分會隨時間改變，請以 OpenRice 頁面為準。食開同唔鐘意只儲存在這部裝置。`;
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function knownPrices(value: string | null): string[] {
  if (!value || !value.trim()) return [];
  const wanted = new Set(
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => (PRICE_BANDS as readonly string[]).includes(part)),
  );
  return PRICE_BANDS.filter((band) => wanted.has(band));
}

function knownStreet(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  return (STREETS as readonly string[]).includes(value) ? value : null;
}

function scopeOf(value: string | null): Scope {
  if (value === 'like' || value === 'been') return 'been';
  if (value === 'dislike') return 'dislike';
  return 'all';
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const queryIndex = raw.indexOf('?');
  const path = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : raw.slice(queryIndex + 1);
  if (path.startsWith('/r/')) {
    return { view: 'detail', id: decodePart(path.slice(3)) };
  }
  const params = new URLSearchParams(query);
  const sortParam = params.get('sort');
  const sort: SortKey = sortParam === 'category' || sortParam === 'name' ? sortParam : 'score';
  const category = params.get('cat');
  return {
    view: 'list',
    cat: category && category.trim() ? category : null,
    q: params.get('q') ?? '',
    sort,
    price: knownPrices(params.get('price')),
    street: knownStreet(params.get('street')),
    scope: scopeOf(params.get('scope')),
  };
}

export function listHash(route: Omit<ListRoute, 'view'>): string {
  const params = new URLSearchParams();
  if (route.cat) params.set('cat', route.cat);
  if (route.q) params.set('q', route.q);
  if (route.sort !== 'score') params.set('sort', route.sort);
  if (route.price.length > 0) params.set('price', route.price.join(','));
  if (route.street) params.set('street', route.street);
  if (route.scope !== 'all') params.set('scope', route.scope);
  const qs = readableQuery(params.toString());
  return qs ? `/?${qs}` : '/';
}

function readableQuery(qs: string): string {
  const decoded = qs.replace(/(?:%[0-9A-Fa-f]{2})+/g, (seq) => {
    try {
      const text = decodeURIComponent(seq);
      return /^[\u0000-\u007f]*$/.test(text) ? seq : text;
    } catch {
      return seq;
    }
  });
  return decoded.replace(/%2C/gi, ',').replace(/%24/g, '$');
}

export function detailHash(id: string): string {
  return `/r/${encodeURIComponent(id)}`;
}
