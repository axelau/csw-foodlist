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

export const STREETS = ['青山道', '元州街', '順寧道', '保安道'] as const;

export const DATA_AS_OF = '2026年10月26日';

export type SortKey = 'score' | 'category' | 'name';

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
}

export interface DetailRoute {
  view: 'detail';
  id: string;
}

export type Route = ListRoute | DetailRoute;

const PLATE: Record<string, string> = {
  '港式/茶餐廳': '#f3eee4',
  '粵菜/海鮮': '#e6f1ec',
  '粉麵/米線': '#f6efe2',
  '西式/咖啡店': '#efece6',
  '甜品/冰品': '#f6eef1',
  '日本菜': '#e7eef3',
  '快餐/連鎖': '#f1f1ee',
  '泰國菜': '#f6f3e4',
  '川菜/中菜': '#f7eee7',
  '火鍋': '#f3ebe6',
  '韓國菜': '#f3eef3',
  '台灣菜': '#eef3ea',
  '其他（東南亞／南亞等）': '#eef1ef',
};

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

export function shortCategory(category: string): string {
  const cut = category.split(/[/（]/)[0];
  return cut || category;
}

export function plateColor(category: string): string {
  return PLATE[category] ?? '#f4f1ea';
}

export function monogram(name: string): string {
  const first = [...name.trim()][0];
  return first ?? '食';
}

export function isLatinMonogram(char: string): boolean {
  return /^[A-Za-z0-9]$/.test(char);
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
  const score =
    restaurant.score == null ? '暫無評分' : `評分 ${formatScore(restaurant.score)}`;
  const sentence = `${restaurant.address}。價錢 ${restaurant.price}，${score}。`;
  if (restaurant.dishes.length === 0) return sentence;
  return `${sentence}菜式：${restaurant.dishes.join('、')}。`;
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

function toRestaurant(
  row: unknown,
  category: string,
  order: number,
  seen: Map<string, number>,
): Restaurant {
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

export function filterAndSort(restaurants: Restaurant[], route: ListRoute): Restaurant[] {
  const rows = restaurants.filter(
    (restaurant) => (route.cat === null || restaurant.category === route.cat) && matches(restaurant, route.q),
  );
  return sortRestaurants(rows, route.sort);
}

export function countMatches(restaurants: Restaurant[], category: string | null, query: string): number {
  return restaurants.filter(
    (restaurant) => (category === null || restaurant.category === category) && matches(restaurant, query),
  ).length;
}

export function neighbors(restaurants: Restaurant[], restaurant: Restaurant): {
  prev: Restaurant | null;
  next: Restaurant | null;
} {
  const group = restaurants.filter((item) => item.category === restaurant.category);
  const index = group.findIndex((item) => item.id === restaurant.id);
  return {
    prev: index > 0 ? group[index - 1] ?? null : null,
    next: index >= 0 ? group[index + 1] ?? null : null,
  };
}

export function footerText(total: number): string {
  return `長沙灣食店目錄收錄 OpenRice 標示為長沙灣的食店，資料截取日期 ${DATA_AS_OF}，共 ${total} 間，按主要菜式分類。本站只是靜態索引，並非 OpenRice 或店家官方網站。店名、地址、價錢同評分會隨時間改變，請以 OpenRice 頁面為準。`;
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
  };
}

export function listHash(category: string | null, query: string, sort: SortKey): string {
  const params = new URLSearchParams();
  if (category) params.set('cat', category);
  if (query) params.set('q', query);
  if (sort !== 'score') params.set('sort', sort);
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

export function detailHash(id: string): string {
  return `/r/${encodeURIComponent(id)}`;
}
