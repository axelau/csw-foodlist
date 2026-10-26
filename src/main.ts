import heroSvg from './hero.svg?raw';
import './fonts.css';
import './style.css';
import {
  DATA_AS_OF,
  FEATURED_STREETS,
  PRICE_BANDS,
  STREETS,
  type ListRoute,
  type MarkAction,
  type Marks,
  type PickPool,
  type Restaurant,
  type Route,
  type Scope,
  type SortKey,
  applyMark,
  arrangeList,
  categoriesIn,
  categoryAliases,
  countMatches,
  defaultList,
  detailHash,
  esc,
  filterAndSort,
  footerText,
  formatScore,
  isDefaultList,
  lede,
  listHash,
  listMetaParts,
  loadRestaurants,
  marksHaveLegacyLike,
  neighbors,
  normalizeMarks,
  pad,
  parseRoute,
  pickRestaurant,
  safeUrl,
  shortCategory,
  streetOf,
} from './data';

const MARKS_KEY = 'csw-foodlist.marks';
const LEGACY_MARKS_KEY = 'csw-foodlist.marks.v1';
const SEARCH_DEBOUNCE_MS = 280;
const MARK_NOTE = '食開同唔鐘意只儲存在這部裝置，不會上傳。';
const NARROW_QUERY = '(max-width: 720px)';

let restaurants: Restaurant[] = [];
let ready = false;
let loadError: string | null = null;
let marks: Marks = emptyStoredMarks();
let lastListHash = '/';
let lastChipKey = '';
let focusHeading = false;
let searchTimer = 0;
let composing = false;
let pickOpen = false;
let pickPool: PickPool = 'all';
let pickId: string | null = null;
let pickNote = '';
let filtersOpen = false;

const EXTERNAL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function emptyStoredMarks(): Marks {
  return normalizeMarks(null);
}

function loadMarks(): Marks {
  try {
    const current = localStorage.getItem(MARKS_KEY);
    const legacy = current ? null : localStorage.getItem(LEGACY_MARKS_KEY);
    const raw = current ?? legacy;
    if (!raw) return emptyStoredMarks();
    const parsed: unknown = JSON.parse(raw);
    const next = normalizeMarks(parsed);
    if (legacy || marksHaveLegacyLike(parsed)) {
      saveMarks(next);
      try {
        localStorage.removeItem(LEGACY_MARKS_KEY);
      } catch {
        // The legacy key can stay; the new key is already the source of truth.
      }
    }
    return next;
  } catch {
    return emptyStoredMarks();
  }
}

function saveMarks(next: Marks): void {
  try {
    const stored: Marks = { been: next.been, dislike: next.dislike, lastPick: next.lastPick };
    localStorage.setItem(MARKS_KEY, JSON.stringify(stored));
  } catch {
    // Private mode or a full disk: keep the in-memory copy for this visit.
  }
}

function currentHash(): string {
  return location.hash.replace(/^#/, '') || '/';
}

function canonical(hash: string): string {
  const route = parseRoute(hash);
  return route.view === 'detail' ? detailHash(route.id) : listHash(route);
}

function rewriteLegacyHash(): void {
  const current = currentHash();
  const route = parseRoute(current);
  if (route.view !== 'list') return;
  const query = current.includes('?') ? current.slice(current.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const legacyLike = params.get('scope') === 'like';
  const rawPrice = params.get('price');
  const priceChanged = rawPrice != null && rawPrice !== route.price.join(',');
  if (!legacyLike && !priceChanged) return;
  const next = listHash(route);
  if (next === current) return;
  history.replaceState(null, '', `${location.pathname}${location.search}#${next}`);
}

function syncBars(): void {
  const mast = document.querySelector<HTMLElement>('.mast');
  const toolbar = document.querySelector<HTMLElement>('.toolbar');
  if (mast) document.documentElement.style.setProperty('--mast-h', `${mast.offsetHeight}px`);
  if (toolbar) document.documentElement.style.setProperty('--toolbar-h', `${toolbar.offsetHeight}px`);
}

function narrowFilters(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

function updateChipOverflow(): void {
  const scroller = document.querySelector<HTMLElement>('#chips');
  const wrap = document.querySelector<HTMLElement>('#chips-scroller');
  if (!scroller || !wrap) return;
  const overflow = scroller.scrollWidth > scroller.clientWidth + 8;
  const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 8;
  wrap.classList.toggle('can-scroll', overflow && !atEnd);
}

function syncFilterUi(): void {
  const route = parseRoute(currentHash());
  const detail = route.view === 'detail';
  document.body.classList.toggle('is-detail', detail);
  document.body.classList.toggle('filters-open', filtersOpen);
  const toggle = document.querySelector<HTMLButtonElement>('#filter-toggle');
  if (toggle) {
    const expanded = !detail && (!narrowFilters() || filtersOpen);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (route.view === 'list') {
      const active = [
        route.cat,
        route.price.length > 0,
        route.street,
        route.scope !== 'all',
        route.sort !== 'score',
      ].filter(Boolean).length;
      toggle.textContent = active > 0 ? `篩選 · ${active}` : '篩選';
    }
  }
  syncBars();
  requestAnimationFrame(updateChipOverflow);
}

function go(hash: string, mode: 'push' | 'replace', scroll: boolean | 'auto'): void {
  const normalized = hash.startsWith('/') ? hash : `/${hash}`;
  if (canonical(currentHash()) === canonical(normalized)) {
    render({ scroll });
    return;
  }
  if (mode === 'replace') {
    history.replaceState(null, '', `${location.pathname}${location.search}#${normalized}`);
    render({ scroll });
    return;
  }
  focusHeading = normalized.startsWith('/r/');
  location.hash = normalized;
}

function queryInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('#q');
  if (!input) throw new Error('找不到搜尋欄');
  return input;
}

function sortValue(): SortKey {
  const select = document.querySelector<HTMLSelectElement>('#sort');
  const value = select?.value;
  return value === 'category' || value === 'name' ? value : 'score';
}

function activeList(): ListRoute {
  const route = parseRoute(currentHash());
  if (route.view === 'list') return route;
  const saved = parseRoute(lastListHash);
  return saved.view === 'list' ? saved : defaultList();
}

function draftList(): ListRoute {
  const base = activeList();
  const input = document.querySelector<HTMLInputElement>('#q');
  if (!input) return base;
  return { ...base, q: input.value };
}

function goList(patch: Partial<Omit<ListRoute, 'view'>>, mode: 'push' | 'replace', scroll: boolean | 'auto'): void {
  window.clearTimeout(searchTimer);
  searchTimer = 0;
  go(listHash({ ...draftList(), ...patch }), mode, scroll);
}

function metaHtml(restaurant: Restaurant): string {
  const parts = listMetaParts(restaurant);
  const tags = parts
    .map((tag) => {
      const muted = tag === '暫無評分' ? ' class="muted"' : '';
      return `<span${muted}>${esc(tag)}</span>`;
    })
    .join('');
  return `<p class="meta">${tags}</p>`;
}

function markButton(kind: 'been' | 'dislike', restaurant: Restaurant): string {
  const label = kind === 'been' ? '食開' : '唔鐘意';
  const on = kind === 'been' ? marks.been.includes(restaurant.id) : marks.dislike.includes(restaurant.id);
  const action = on ? `取消${label}` : label;
  return `<button type="button" class="mark" data-mark="${kind}" data-id="${esc(restaurant.id)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${esc(`${action} ${restaurant.name}`)}">${label}</button>`;
}

function clearButton(restaurant: Restaurant): string {
  return `<button type="button" class="mark mark-clear" data-mark="clear" data-id="${esc(restaurant.id)}" aria-pressed="true" aria-label="${esc(`解除唔鐘意 ${restaurant.name}`)}">解除</button>`;
}

function marksHtml(restaurant: Restaurant, className: string): string {
  const clear = marks.dislike.includes(restaurant.id) ? clearButton(restaurant) : '';
  return `<div class="${className}" role="group" aria-label="${esc(`標記 ${restaurant.name}`)}">${markButton('been', restaurant)}${markButton('dislike', restaurant)}${clear}</div>`;
}

function entryHtml(restaurant: Restaurant, index: number): string {
  const dishes =
    restaurant.dishes.length > 0
      ? `<p class="excerpt dishes">菜式：${esc(restaurant.dishes.join('、'))}</p>`
      : '';
  return `<article class="entry"><a class="entry-main" href="#${detailHash(restaurant.id)}"><span class="num">${pad(index)}.</span><span class="entry-body"><h2>${esc(restaurant.name)}</h2>${metaHtml(restaurant)}<p class="excerpt">${esc(restaurant.address || '未有地址')}</p>${dishes}</span></a>${marksHtml(restaurant, 'marks marks-float')}</article>`;
}

function collapsedHtml(restaurant: Restaurant): string {
  return `<article class="entry entry-collapsed"><h2 class="collapsed-name"><a href="#${detailHash(restaurant.id)}">${esc(restaurant.name)}</a></h2>${clearButton(restaurant)}</article>`;
}

function scopeCount(route: ListRoute, scope: Scope): number {
  return countMatches(restaurants, { ...route, scope }, marks);
}

function asideHtml(route: ListRoute, shown: number, total: number): string {
  const streetButtons = FEATURED_STREETS.map((street) => {
    const active = route.street === street ? ' is-active' : '';
    const pressed = active ? 'true' : 'false';
    return `<button type="button" class="street${active}" data-street="${esc(street)}" aria-pressed="${pressed}">${esc(street)}</button>`;
  }).join('');
  const beenIn = scopeCount(route, 'been');
  const dislikeIn = scopeCount(route, 'dislike');
  return `<aside class="aside"><p class="aside-kicker">今次顯示</p><p class="aside-count">${shown}</p><p class="aside-unit">間食店</p><p class="aside-note">全部 ${total} 間 · ${categoriesIn(restaurants).length} 個種類 · 此篩選內 食開 ${beenIn} · 唔鐘意 ${dislikeIn}<br>${esc(MARK_NOTE)}</p><div class="streets" role="group" aria-label="街道篩選">${streetButtons}</div></aside>`;
}

function hasNarrowing(route: ListRoute): boolean {
  return Boolean(route.cat || route.q.trim() || route.price.length > 0 || route.street);
}

function emptyCopy(route: ListRoute): { title: string; help: string } {
  const narrowed = hasNarrowing(route);
  if (route.scope === 'been' && !narrowed && marks.been.length === 0) {
    return {
      title: '未有食開的食店',
      help: '食過的店可以按「食開」記低。',
    };
  }
  if (route.scope === 'dislike' && !narrowed && marks.dislike.length === 0) {
    return {
      title: '未有唔鐘意的食店',
      help: '唔想再抽中的店可以按「唔鐘意」，嗰行會收成店名，並移到名單最底。',
    };
  }
  if (route.scope === 'been') {
    return { title: '沒有符合的食開食店', help: '試下放寬種類、價錢或街道，或者清除篩選。' };
  }
  if (route.scope === 'dislike') {
    return { title: '沒有符合的唔鐘意食店', help: '試下放寬種類、價錢或街道，或者清除篩選。' };
  }
  return { title: '找不到相符食店', help: '試下其他種類、價錢或街道，或者清除篩選。' };
}

function heroCopy(restaurant: Restaurant | null, route: ListRoute, shown: number): string {
  if (restaurant) {
    return `<div class="wrap hero-copy"><a class="hero-link" href="#${detailHash(restaurant.id)}"><p class="num">01.</p><h1>${esc(restaurant.name)}</h1>${metaHtml(restaurant)}</a>${marksHtml(restaurant, 'marks hero-marks')}</div>`;
  }
  if (shown > 0) {
    return `<div class="wrap hero-copy"><p class="num">00.</p><h1>目前結果都已標記唔鐘意</h1><p class="help">按「解除」會還原完整卡片，並回到原本排序位置。</p></div>`;
  }
  const copy = emptyCopy(route);
  return `<div class="wrap hero-copy"><p class="num">00.</p><h1>${esc(copy.title)}</h1><p class="help">${esc(copy.help)}</p><p class="mark-note">${esc(MARK_NOTE)}</p><div class="empty-actions"><button type="button" class="btn" id="clear-filters">清除篩選</button></div></div>`;
}

function dekIntro(lead: Restaurant | null, shown: number): string {
  if (lead) {
    return `<div class="intro-copy"><p class="lede">${esc(lede(lead))}</p><p class="help">點開食店可看地址、價錢、評分，並前往 OpenRice。可以篩選、標記食開或唔鐘意，也可以隨機抽一間。</p><p class="mark-note">${esc(MARK_NOTE)}</p></div>`;
  }
  if (shown > 0) {
    return `<div class="intro-copy"><p class="help">完整卡片收在名單最底，按「解除」即可還原。</p></div>`;
  }
  return `<div class="intro-copy"><p class="help">可以改用種類、價錢或街道，也可以搜尋店名同菜式。</p></div>`;
}

function listHtml(route: ListRoute): string {
  const ordered = arrangeList(restaurants, route, marks);
  const lead = ordered.find((restaurant) => !marks.dislike.includes(restaurant.id)) ?? null;
  const rest = lead ? ordered.filter((restaurant) => restaurant.id !== lead.id) : ordered;
  const hero = `<section class="hero"><div class="hero-art" aria-hidden="true">${heroSvg}</div>${heroCopy(lead, route, ordered.length)}</section>`;
  const dek = `<section class="dek wrap">${dekIntro(lead, ordered.length)}${asideHtml(route, ordered.length, restaurants.length)}</section>`;
  if (rest.length === 0) return `${hero}${dek}`;
  let index = lead ? 1 : 0;
  const items = rest
    .map((restaurant) => {
      if (marks.dislike.includes(restaurant.id)) return collapsedHtml(restaurant);
      index += 1;
      return entryHtml(restaurant, index);
    })
    .join('');
  const continueLabel = lead ? `<p class="continue">其餘 ${rest.length} 間</p>` : '';
  return `${hero}${dek}<section class="wrap list">${continueLabel}${items}</section>`;
}

function detailHtml(id: string): string {
  const restaurant = restaurants.find((item) => item.id === id);
  if (!restaurant) {
    return `<article class="detail wrap"><a class="back" href="#${esc(lastListHash)}">← 返回目錄</a><p class="num">00.</p><h1 tabindex="-1">找不到這間食店</h1><p class="help">這條連結沒有對應的食店。返回目錄再搜尋一次。</p></article>`;
  }
  const link = safeUrl(restaurant.url);
  const street = streetOf(restaurant.address);
  const kicker = street ? `${restaurant.category} · ${street}` : restaurant.category;
  const aliases = categoryAliases(restaurant.category);
  const cuisines = restaurant.cuisines.filter((cuisine) => !aliases.has(cuisine.trim()));
  const cuisineMeta =
    cuisines.length > 0 ? `<p class="meta">${cuisines.map((cuisine) => `<span>${esc(cuisine)}</span>`).join('')}</p>` : '';
  const scoreValue =
    restaurant.score == null
      ? `<dd class="score-empty">暫無評分</dd>`
      : `<dd class="fact-num">${esc(formatScore(restaurant.score))}</dd>`;
  const dishes =
    restaurant.dishes.length > 0
      ? `<h2 class="subhead">菜式</h2><ul class="dish-list">${restaurant.dishes.map((dish) => `<li>${esc(dish)}</li>`).join('')}</ul>`
      : '';
  const openRice = link
    ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">在 OpenRice 開啟<span class="vh">（${esc(restaurant.name)}，新分頁）</span>${EXTERNAL_ICON}</a>`
    : `<p class="fine">這間食店沒有可用的 OpenRice 連結。</p>`;
  const nearby = neighbors(restaurants, restaurant);
  const prev = nearby.prev
    ? `<a class="neighbor prev" href="#${detailHash(nearby.prev.id)}"><span class="neighbor-kicker">上一間</span><span class="neighbor-name">${esc(nearby.prev.name)}</span></a>`
    : `<span></span>`;
  const next = nearby.next
    ? `<a class="neighbor next" href="#${detailHash(nearby.next.id)}"><span class="neighbor-kicker">下一間</span><span class="neighbor-name">${esc(nearby.next.name)}</span></a>`
    : `<span></span>`;
  return `<article class="detail wrap"><a class="back" href="#${esc(lastListHash)}">← 返回目錄</a><p class="kicker">${esc(kicker)}</p><h1 tabindex="-1">${esc(restaurant.name)}</h1>${cuisineMeta}${marksHtml(restaurant, 'marks detail-marks')}<p class="fine mark-note">${esc(MARK_NOTE)}</p><p class="lede">${esc(restaurant.address || '未有地址')}</p><dl class="facts"><div><dt>價錢</dt><dd class="fact-num">${esc(restaurant.price)}</dd></div><div><dt>評分</dt>${scoreValue}</div><div><dt>來源</dt><dd>${esc(restaurant.source)}</dd></div></dl>${dishes}${openRice}<p class="fine">資料截至 ${DATA_AS_OF}。營業狀況、價錢同評分以 OpenRice 及店家為準。</p><nav class="neighbors" aria-label="同種類食店">${prev}${next}</nav></article>`;
}

function titleFor(route: Route): string {
  if (!ready) return '長沙灣食店目錄';
  if (route.view === 'detail') {
    const restaurant = restaurants.find((item) => item.id === route.id);
    return restaurant ? `${restaurant.name} · 長沙灣食店目錄` : '找不到這間食店 · 長沙灣食店目錄';
  }
  const bits: string[] = [];
  if (route.scope === 'been') bits.push('食開');
  if (route.scope === 'dislike') bits.push('唔鐘意');
  if (route.street) bits.push(route.street);
  if (route.price.length > 0) bits.push(route.price.join('、'));
  if (route.cat) bits.push(route.cat);
  if (route.q.trim()) bits.push(`「${route.q.trim()}」`);
  if (bits.length === 0) return '長沙灣食店目錄';
  return `${bits.join(' · ')} · 長沙灣食店目錄`;
}

function chip(label: string, count: number, attrs: string, pressed: boolean): string {
  return `<button type="button" class="chip sm" ${attrs} aria-pressed="${pressed ? 'true' : 'false'}">${esc(label)}<span class="chip-count">${count}</span></button>`;
}

function updateChips(route: ListRoute): void {
  const chips = document.querySelector<HTMLElement>('#chips');
  if (!chips) return;
  const prevScroll = chips.scrollLeft;
  const categories = ready ? categoriesIn(restaurants) : [];
  const buttons = [
    { cat: '', label: '全部' },
    ...categories.map((category) => ({ cat: category, label: category })),
  ];
  chips.innerHTML = buttons
    .map(({ cat, label }) => {
      const pressed = route.cat === (cat || null) || (route.cat === null && cat === '');
      const count = countMatches(restaurants, { ...route, cat: cat || null }, marks);
      return `<button type="button" class="chip" data-cat="${esc(cat)}" aria-pressed="${pressed ? 'true' : 'false'}">${esc(label)}<span class="chip-count">${count}</span></button>`;
    })
    .join('');
  const key = route.cat ?? '';
  if (key !== lastChipKey) {
    lastChipKey = key;
    const selected = chips.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (selected) {
      const left = selected.offsetLeft;
      const right = left + selected.offsetWidth;
      if (left < chips.scrollLeft) chips.scrollLeft = Math.max(0, left - 8);
      else if (right > chips.scrollLeft + chips.clientWidth) chips.scrollLeft = right - chips.clientWidth + 8;
    }
  } else {
    chips.scrollLeft = prevScroll;
  }
  requestAnimationFrame(updateChipOverflow);
}

function togglePrices(current: readonly string[], price: string): string[] {
  const next = new Set(current);
  if (next.has(price)) next.delete(price);
  else next.add(price);
  return PRICE_BANDS.filter((band) => next.has(band));
}

function updateRefine(route: ListRoute): void {
  const refine = document.querySelector<HTMLElement>('#refine');
  if (!refine) return;
  const prices = [
    chip('不限', scopeCount({ ...route, price: [] }, route.scope), 'data-price=""', route.price.length === 0),
    ...PRICE_BANDS.map((price) =>
      chip(
        price,
        countMatches(restaurants, { ...route, price: [price] }, marks),
        `data-price="${esc(price)}"`,
        route.price.includes(price),
      ),
    ),
  ].join('');
  const streetOptions = [
    `<option value="">全部街道</option>`,
    ...STREETS.map((street) => {
      const count = countMatches(restaurants, { ...route, street }, marks);
      const selected = route.street === street ? ' selected' : '';
      return `<option value="${esc(street)}"${selected}>${esc(street)} · ${count}</option>`;
    }),
  ].join('');
  const scopes: { scope: Scope; label: string }[] = [
    { scope: 'all', label: '全部' },
    { scope: 'been', label: '食開' },
    { scope: 'dislike', label: '唔鐘意' },
  ];
  const scopeButtons = scopes
    .map(({ scope, label }) =>
      chip(label, scopeCount(route, scope), `data-scope="${scope}"`, route.scope === scope),
    )
    .join('');
  const clear = isDefaultList(route) ? '' : `<button type="button" class="text-btn" data-clear>清除篩選</button>`;
  refine.innerHTML = `<div class="refine-group"><span class="refine-label" id="price-label">價錢</span><div class="mini-chips" role="group" aria-labelledby="price-label">${prices}</div></div><div class="refine-group"><span class="refine-label" id="street-label">街道</span><select id="street" class="street-select" aria-labelledby="street-label">${streetOptions}</select></div><div class="refine-group"><span class="refine-label" id="scope-label">標記<span class="refine-hint">此篩選內</span></span><div class="mini-chips" role="group" aria-labelledby="scope-label">${scopeButtons}</div></div><div class="refine-actions"><button type="button" class="btn btn-sm" data-open-pick ${ready ? '' : 'disabled'}>隨機一間</button>${clear}</div>`;
}

function updateChrome(route: Route): void {
  const list = route.view === 'list' ? route : activeList();
  updateChips(list);
  updateRefine(list);
  const count = document.querySelector<HTMLElement>('#count');
  if (count) {
    if (!ready) count.textContent = '';
    else if (route.view === 'detail') {
      const restaurant = restaurants.find((item) => item.id === route.id);
      count.textContent = restaurant ? shortCategory(restaurant.category) : '';
    } else {
      const shown = countMatches(restaurants, route, marks);
      const suffix = route.scope === 'been' ? '食開' : route.scope === 'dislike' ? '唔鐘意' : '';
      count.textContent = suffix ? `顯示 ${shown} 間${suffix}` : `顯示 ${shown} 間`;
    }
  }
  const select = document.querySelector<HTMLSelectElement>('#sort');
  if (select && document.activeElement !== select) select.value = list.sort;
  const input = document.querySelector<HTMLInputElement>('#q');
  if (input && document.activeElement !== input && searchTimer === 0 && input.value !== list.q) input.value = list.q;
  const pill = document.querySelector<HTMLAnchorElement>('#home-pill');
  if (pill) {
    const onHome = route.view === 'list' && isDefaultList(route);
    if (onHome) pill.setAttribute('aria-current', 'page');
    else pill.removeAttribute('aria-current');
  }
  const note = document.querySelector<HTMLElement>('#foot-note');
  if (note && ready) note.textContent = footerText(restaurants.length);
}

function render(opts: { scroll?: boolean | 'auto' } = {}): void {
  const route = parseRoute(currentHash());
  if (route.view === 'list') lastListHash = currentHash();
  updateChrome(route);
  const main = document.querySelector<HTMLElement>('#content');
  if (!main) return;
  if (loadError) {
    main.innerHTML = `<section class="hero"><div class="hero-art" aria-hidden="true">${heroSvg}</div><div class="wrap hero-copy"><p class="num">00.</p><h1>資料載入失敗</h1><p class="help">${esc(loadError)}請重新整理頁面。</p></div></section>`;
  } else if (!ready) {
    main.innerHTML = `<p class="state">正在載入食店目錄…</p>`;
  } else if (route.view === 'detail') {
    main.innerHTML = detailHtml(route.id);
    if (focusHeading) main.querySelector<HTMLElement>('h1')?.focus();
  } else {
    main.innerHTML = listHtml(route);
  }
  focusHeading = false;
  document.title = titleFor(route);
  const scroll = opts.scroll ?? false;
  if (scroll === true) window.scrollTo(0, 0);
  else if (scroll === 'auto' && window.scrollY > 360) window.scrollTo(0, 0);
  syncFilterUi();
}

function withoutDislike(rows: readonly Restaurant[]): Restaurant[] {
  return rows.filter((restaurant) => !marks.dislike.includes(restaurant.id));
}

function poolOf(pool: PickPool): Restaurant[] {
  if (pool === 'all') return withoutDislike(restaurants);
  if (pool === 'saved') return restaurants.filter((restaurant) => marks.been.includes(restaurant.id));
  const list = activeList();
  const filtered = filterAndSort(restaurants, list, marks);
  if (list.scope === 'dislike') return filtered;
  return withoutDislike(filtered);
}

function describeFilters(route: ListRoute): string {
  const parts: string[] = [];
  if (route.scope === 'been') parts.push('食開');
  else if (route.scope === 'dislike') parts.push('唔鐘意');
  if (route.cat) parts.push(route.cat);
  if (route.price.length > 0) parts.push(route.price.join('、'));
  if (route.street) parts.push(route.street);
  if (route.q.trim()) parts.push(`「${route.q.trim()}」`);
  const base = parts.length === 0 ? '目前沒有額外篩選' : parts.join(' · ');
  if (route.scope === 'dislike') return base;
  return `${base} · 不包括唔鐘意`;
}

function paintPick(): void {
  const pools = document.querySelector<HTMLElement>('#pick-pools');
  const result = document.querySelector<HTMLElement>('#pick-result');
  if (!pools || !result) return;
  const choices: { id: PickPool; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'filters', label: '目前篩選' },
    { id: 'saved', label: '食開' },
  ];
  pools.innerHTML = choices
    .map(({ id, label }) => {
      const count = poolOf(id).length;
      const pressed = pickPool === id;
      return `<button type="button" class="chip sm" data-pool="${id}" aria-pressed="${pressed ? 'true' : 'false'}">${esc(label)}<span class="chip-count">${count}</span></button>`;
    })
    .join('');
  const restaurant = pickId ? (restaurants.find((item) => item.id === pickId) ?? null) : null;
  if (!restaurant) {
    result.innerHTML = `<h2 class="pick-name">這個範圍沒有食店</h2><p class="help">試下改選全部、目前篩選或食開。預設唔會抽中唔鐘意的食店。</p>`;
    return;
  }
  const range =
    pickPool === 'filters'
      ? describeFilters(activeList())
      : pickPool === 'saved'
        ? `食開 ${poolOf('saved').length} 間`
        : `全部 ${poolOf('all').length} 間，已排除唔鐘意`;
  const note = pickNote ? `<p class="fine">${esc(pickNote)}</p>` : '';
  const dishes =
    restaurant.dishes.length > 0
      ? `<p class="excerpt dishes">菜式：${esc(restaurant.dishes.join('、'))}</p>`
      : '';
  result.innerHTML = `<p class="fine pick-range">${esc(range)}</p><h2 class="pick-name">${esc(restaurant.name)}</h2>${metaHtml(restaurant)}<p class="excerpt">${esc(restaurant.address || '未有地址')}</p>${dishes}${note}<div class="pick-actions"><button type="button" class="btn" data-pick-again>再抽一次</button><a class="btn btn-ghost" href="#${detailHash(restaurant.id)}">看這間食店</a></div>${marksHtml(restaurant, 'marks pick-marks')}`;
}

function drawPick(): void {
  const pool = poolOf(pickPool);
  const result = pickRestaurant(pool, pickId ?? marks.lastPick);
  pickId = result.restaurant?.id ?? null;
  pickNote = result.onlyChoice ? '這個範圍只得這一間。' : result.avoided ? '已避開上一間。' : '';
  if (result.restaurant) {
    marks = { ...marks, lastPick: result.restaurant.id };
    saveMarks(marks);
  }
  paintPick();
}

function openPick(): void {
  if (!ready || pickOpen) return;
  const list = activeList();
  pickPool = isDefaultList(list) ? 'all' : 'filters';
  pickId = null;
  pickNote = '';
  pickOpen = true;
  document.querySelector('#pick')?.removeAttribute('hidden');
  document.body.classList.add('pick-open');
  drawPick();
  document.querySelector<HTMLElement>('.pick-card')?.focus();
}

function closePick(restore = true): void {
  if (!pickOpen) return;
  pickOpen = false;
  document.querySelector('#pick')?.setAttribute('hidden', '');
  document.body.classList.remove('pick-open');
  if (restore) document.querySelector<HTMLElement>('[data-open-pick]')?.focus();
}

function dataSelector(name: string, value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[data-${name}="${escaped}"]`;
}

function focusSelector(action: MarkAction, id: string): string {
  const idSel = dataSelector('id', id);
  if (marks.dislike.includes(id)) return `[data-mark="clear"]${idSel}`;
  if (action === 'been') return `[data-mark="been"]${idSel}`;
  return `[data-mark="dislike"]${idSel}`;
}

function restoreScroll(x: number, y: number): void {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(x, y);
  root.style.scrollBehavior = previous;
}

/** Keep restoring for a couple of frames so focus and scroll anchoring cannot follow a moved card. */
function holdScroll(x: number, y: number): void {
  restoreScroll(x, y);
  requestAnimationFrame(() => {
    restoreScroll(x, y);
    requestAnimationFrame(() => restoreScroll(x, y));
  });
}

/** Height of a card that sits fully above the sticky header. Closing that gap would yank the viewport unless scroll shrinks with it. */
function aboveFoldShift(id: string): number {
  const node = document.querySelector<HTMLElement>(dataSelector('id', id))?.closest<HTMLElement>('.entry, .hero-copy');
  if (!node) return 0;
  const rect = node.getBoundingClientRect();
  const headerBottom = document.querySelector('.list-chrome')?.getBoundingClientRect().bottom ?? 0;
  if (rect.bottom <= headerBottom + 1) return rect.height;
  return 0;
}

function toggleMark(action: MarkAction, id: string): void {
  const x = window.scrollX;
  const y = window.scrollY;
  const nextY = Math.max(0, y - aboveFoldShift(id));
  marks = applyMark(marks, action, id);
  saveMarks(marks);
  render();
  if (pickOpen) paintPick();
  restoreScroll(x, nextY);
  const root = pickOpen ? document.querySelector('#pick') : document;
  const again = root?.querySelector<HTMLElement>(focusSelector(action, id));
  if (again) again.focus({ preventScroll: true });
  else if (!pickOpen) document.querySelector<HTMLElement>('#content')?.focus({ preventScroll: true });
  holdScroll(x, nextY);
}

function focusableInPick(): HTMLElement[] {
  const card = document.querySelector('.pick-card');
  if (!card) return [];
  return [...card.querySelectorAll<HTMLElement>('a, button, select, input, textarea')].filter(
    (el) => !el.hasAttribute('disabled'),
  );
}

function bind(): void {
  const form = document.querySelector<HTMLFormElement>('#search-form');
  const input = queryInput();
  const chips = document.querySelector<HTMLElement>('#chips');
  const sort = document.querySelector<HTMLSelectElement>('#sort');

  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    input.dispatchEvent(new Event('input'));
  });
  input.addEventListener('input', () => {
    if (composing) return;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      go(listHash(draftList()), 'replace', 'auto');
    }, SEARCH_DEBOUNCE_MS);
  });
  input.addEventListener('search', () => {
    if (composing || input.value !== '') return;
    goList({ q: '' }, 'push', true);
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    goList({ q: input.value }, 'push', true);
  });

  chips?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-cat]');
    if (!button) return;
    const category = button.dataset.cat || null;
    goList({ cat: category }, 'push', true);
  });
  chips?.addEventListener('scroll', () => updateChipOverflow(), { passive: true });

  sort?.addEventListener('change', () => {
    goList({ sort: sortValue() }, 'push', true);
  });

  document.body.addEventListener('change', (event) => {
    const select = event.target as HTMLElement;
    if (!(select instanceof HTMLSelectElement) || select.id !== 'street') return;
    goList({ street: select.value || null }, 'push', true);
  });

  document.body.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('a[href^="#/r/"]')) window.clearTimeout(searchTimer);

    if (target.closest('#filter-toggle')) {
      filtersOpen = !filtersOpen;
      syncFilterUi();
      return;
    }

    const mark = target.closest<HTMLButtonElement>('[data-mark]');
    const action = mark?.dataset.mark;
    if (mark?.dataset.id && (action === 'been' || action === 'dislike' || action === 'clear')) {
      toggleMark(action, mark.dataset.id);
      return;
    }
    if (target.closest('[data-pick-close]') || target.id === 'pick') {
      closePick();
      return;
    }
    const poolBtn = target.closest<HTMLButtonElement>('[data-pool]');
    if (poolBtn?.dataset.pool === 'all' || poolBtn?.dataset.pool === 'filters' || poolBtn?.dataset.pool === 'saved') {
      if (poolBtn.dataset.pool !== pickPool) {
        pickPool = poolBtn.dataset.pool;
        drawPick();
        document.querySelector<HTMLElement>(`#pick [data-pool="${pickPool}"]`)?.focus();
      }
      return;
    }
    if (target.closest('[data-pick-again]')) {
      drawPick();
      document.querySelector<HTMLElement>('[data-pick-again]')?.focus();
      return;
    }
    if (target.closest('[data-open-pick]')) {
      openPick();
      return;
    }
    const priceBtn = target.closest<HTMLElement>('[data-price]');
    if (priceBtn) {
      const value = priceBtn.dataset.price ?? '';
      const nextPrices = value ? togglePrices(draftList().price, value) : [];
      goList({ price: nextPrices }, 'push', true);
      document.querySelector<HTMLElement>(value ? dataSelector('price', value) : '[data-price=""]')?.focus();
      return;
    }
    const scopeBtn = target.closest<HTMLElement>('[data-scope]');
    if (scopeBtn?.dataset.scope === 'all' || scopeBtn?.dataset.scope === 'been' || scopeBtn?.dataset.scope === 'dislike') {
      const scope = scopeBtn.dataset.scope;
      goList({ scope }, 'push', true);
      document.querySelector<HTMLElement>(`[data-scope="${scope}"]`)?.focus();
      return;
    }
    if (target.closest('[data-clear], #clear-filters')) {
      window.clearTimeout(searchTimer);
      searchTimer = 0;
      input.value = '';
      go('/', 'push', true);
      return;
    }
    const street = target.closest<HTMLElement>('[data-street]');
    if (street?.dataset.street) {
      const name = street.dataset.street;
      const base = draftList();
      goList({ street: base.street === name ? null : name }, 'push', true);
    }
  });

  window.addEventListener('hashchange', () => {
    window.clearTimeout(searchTimer);
    searchTimer = 0;
    if (pickOpen) closePick(false);
    focusHeading = location.hash.startsWith('#/r/');
    rewriteLegacyHash();
    render({ scroll: true });
  });

  window.addEventListener('resize', () => {
    syncBars();
    updateChipOverflow();
  });
  window.matchMedia(NARROW_QUERY).addEventListener('change', syncFilterUi);

  window.addEventListener('storage', (event) => {
    if (event.key !== MARKS_KEY && event.key !== LEGACY_MARKS_KEY) return;
    marks = loadMarks();
    render();
    if (pickOpen) paintPick();
  });

  window.addEventListener('keydown', (event) => {
    if (pickOpen && event.key === 'Escape') {
      event.preventDefault();
      closePick();
      return;
    }
    if (pickOpen && event.key === 'Tab') {
      const items = focusableInPick();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      const card = document.querySelector('.pick-card');
      if (event.shiftKey && (active === first || (card && !card.contains(active)))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (pickOpen) return;
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = document.activeElement?.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    event.preventDefault();
    input.focus();
  });
}

marks = loadMarks();
rewriteLegacyHash();
bind();
render();
syncBars();

loadRestaurants()
  .then((rows) => {
    restaurants = rows;
    ready = true;
    render();
  })
  .catch((error: unknown) => {
    loadError = error instanceof Error ? error.message : '無法載入食店資料';
    render();
  });
