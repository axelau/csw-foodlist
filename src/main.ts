import heroSvg from './hero.svg?raw';
import './fonts.css';
import './style.css';
import {
  DATA_AS_OF,
  STREETS,
  type ListRoute,
  type Restaurant,
  type Route,
  type SortKey,
  categoriesIn,
  countMatches,
  detailHash,
  esc,
  filterAndSort,
  footerText,
  formatScore,
  isLatinMonogram,
  lede,
  listHash,
  loadRestaurants,
  matches,
  monogram,
  neighbors,
  pad,
  parseRoute,
  plateColor,
  safeUrl,
  shortCategory,
} from './data';

let restaurants: Restaurant[] = [];
let ready = false;
let loadError: string | null = null;
let lastListHash = '/';
let lastChipKey = '';
let focusHeading = false;
let searchTimer = 0;
let composing = false;

const EXTERNAL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-9 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function currentHash(): string {
  return location.hash.replace(/^#/, '') || '/';
}

function syncMastHeight(): void {
  const mast = document.querySelector<HTMLElement>('.mast');
  if (!mast) return;
  document.documentElement.style.setProperty('--mast-h', `${mast.offsetHeight}px`);
}

function go(hash: string, mode: 'push' | 'replace', scroll: boolean | 'auto'): void {
  const normalized = hash.startsWith('/') ? hash : `/${hash}`;
  if (currentHash() === normalized) {
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

function metaHtml(restaurant: Restaurant, includeCategory: boolean): string {
  const tags: string[] = [];
  if (includeCategory) tags.push(`<span>${esc(restaurant.category)}</span>`);
  for (const cuisine of restaurant.cuisines) tags.push(`<span>${esc(cuisine)}</span>`);
  tags.push(`<span>${esc(restaurant.price)}</span>`);
  tags.push(
    restaurant.score == null
      ? `<span class="muted">暫無評分</span>`
      : `<span>${esc(formatScore(restaurant.score))}</span>`,
  );
  return `<p class="meta">${tags.join('')}</p>`;
}

function plateHtml(restaurant: Restaurant): string {
  const glyph = monogram(restaurant.name);
  const latin = isLatinMonogram(glyph) ? ' latin' : '';
  return `<span class="plate" style="background:${plateColor(restaurant.category)}" aria-hidden="true"><span class="plate-char${latin}">${esc(glyph)}</span><span class="plate-cat">${esc(shortCategory(restaurant.category))}</span></span>`;
}

function entryHtml(restaurant: Restaurant, index: number): string {
  const dishes =
    restaurant.dishes.length > 0
      ? `<p class="excerpt dishes">菜式：${esc(restaurant.dishes.join('、'))}</p>`
      : '';
  return `<a class="entry" href="#${detailHash(restaurant.id)}"><span class="num">${pad(index)}.</span>${plateHtml(restaurant)}<span class="entry-body"><h2>${esc(restaurant.name)}</h2>${metaHtml(restaurant, true)}<p class="excerpt">${esc(restaurant.address || '未有地址')}</p>${dishes}</span></a>`;
}

function asideHtml(shown: number, total: number): string {
  const streetButtons = STREETS.map((street) => {
    const route = parseRoute(currentHash());
    const active = route.view === 'list' && route.q === street ? ' is-active' : '';
    const pressed = active ? 'true' : 'false';
    return `<button type="button" class="street${active}" data-street="${esc(street)}" aria-pressed="${pressed}">${esc(street)}</button>`;
  }).join('');
  return `<aside class="aside"><p class="aside-kicker">今次顯示</p><p class="aside-count">${shown}</p><p class="aside-unit">間食店</p><p class="aside-note">全部 ${total} 間 · ${categoriesIn(restaurants).length} 個種類<br>資料截至 ${DATA_AS_OF}</p><div class="streets" role="group" aria-label="街道快捷搜尋">${streetButtons}</div></aside>`;
}

function heroCopy(restaurant: Restaurant | null): string {
  if (!restaurant) {
    return `<div class="wrap hero-copy"><p class="num">00.</p><h1>找不到相符食店</h1><p class="help">試下其他關鍵字，或者清除篩選。可以搜尋店名、街道或菜式。</p><div class="empty-actions"><button type="button" class="btn" id="clear-filters">清除篩選</button></div></div>`;
  }
  return `<div class="wrap hero-copy"><a class="hero-link" href="#${detailHash(restaurant.id)}"><p class="num">01.</p><h1>${esc(restaurant.name)}</h1>${metaHtml(restaurant, true)}</a></div>`;
}

function listHtml(route: ListRoute): string {
  const filtered = filterAndSort(restaurants, route);
  const [lead, ...rest] = filtered;
  const intro = lead
    ? `<div><p class="lede">${esc(lede(lead))}</p><p class="help">點開食店可看地址、價錢、評分，並前往 OpenRice。可搜尋店名、街道或菜式，例如元州街、燒臘、冰室。</p></div>`
    : `<div><p class="help">可以改用種類，或者搜尋街道同菜式。</p></div>`;
  const dek = `<section class="dek wrap">${intro}${asideHtml(filtered.length, restaurants.length)}</section>`;
  const hero = `<section class="hero"><div class="hero-art" aria-hidden="true">${heroSvg}</div>${heroCopy(lead ?? null)}</section>${dek}`;
  if (!lead) return hero;
  if (rest.length === 0) return hero;
  const items = rest.map((restaurant, index) => entryHtml(restaurant, index + 2)).join('');
  return `${hero}<section class="wrap list"><p class="continue">其餘 ${rest.length} 間</p>${items}</section>`;
}

function detailHtml(id: string): string {
  const restaurant = restaurants.find((item) => item.id === id);
  if (!restaurant) {
    return `<article class="detail wrap"><a class="back" href="#${esc(lastListHash)}">← 返回目錄</a><p class="num">00.</p><h1 tabindex="-1">找不到這間食店</h1><p class="help">這條連結沒有對應的食店。返回目錄再搜尋一次。</p></article>`;
  }
  const link = safeUrl(restaurant.url);
  const cuisineMeta =
    restaurant.cuisines.length > 0
      ? `<p class="meta">${restaurant.cuisines.map((cuisine) => `<span>${esc(cuisine)}</span>`).join('')}</p>`
      : '';
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
  return `<article class="detail wrap"><a class="back" href="#${esc(lastListHash)}">← 返回目錄</a><p class="kicker">${esc(restaurant.category)}</p><h1 tabindex="-1">${esc(restaurant.name)}</h1>${cuisineMeta}<p class="lede">${esc(restaurant.address || '未有地址')}</p><dl class="facts"><div><dt>價錢</dt><dd class="fact-num">${esc(restaurant.price)}</dd></div><div><dt>評分</dt>${scoreValue}</div><div><dt>來源</dt><dd>${esc(restaurant.source)}</dd></div></dl>${dishes}${openRice}<p class="fine">資料截至 ${DATA_AS_OF}。營業狀況、價錢同評分以 OpenRice 及店家為準。</p><nav class="neighbors" aria-label="同種類食店">${prev}${next}</nav></article>`;
}

function titleFor(route: Route): string {
  if (!ready) return '長沙灣食店目錄';
  if (route.view === 'detail') {
    const restaurant = restaurants.find((item) => item.id === route.id);
    return restaurant ? `${restaurant.name} · 長沙灣食店目錄` : '找不到這間食店 · 長沙灣食店目錄';
  }
  if (route.q.trim()) return `「${route.q.trim()}」· 長沙灣食店目錄`;
  if (route.cat) return `${route.cat} · 長沙灣食店目錄`;
  return '長沙灣食店目錄';
}

function updateChips(active: string | null | undefined, query: string): void {
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
      const pressed = active !== undefined && (active ?? '') === cat;
      const count = ready ? `<span class="chip-count">${countMatches(restaurants, cat || null, query)}</span>` : '';
      return `<button type="button" class="chip" data-cat="${esc(cat)}" aria-pressed="${pressed ? 'true' : 'false'}">${esc(label)}${count}</button>`;
    })
    .join('');
  const key = active ?? '';
  if (key !== lastChipKey) {
    lastChipKey = key;
    const selected = chips.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (selected) {
      const left = selected.offsetLeft;
      const right = left + selected.offsetWidth;
      if (left < chips.scrollLeft) chips.scrollLeft = Math.max(0, left - 8);
      else if (right > chips.scrollLeft + chips.clientWidth) {
        chips.scrollLeft = right - chips.clientWidth + 8;
      }
    }
  } else {
    chips.scrollLeft = prevScroll;
  }
}

function updateChrome(route: Route): void {
  const query = route.view === 'list' ? route.q : '';
  updateChips(route.view === 'list' ? route.cat : undefined, query);
  const count = document.querySelector<HTMLElement>('#count');
  if (count) {
    if (!ready) count.textContent = '';
    else if (route.view === 'detail') {
      const restaurant = restaurants.find((item) => item.id === route.id);
      count.textContent = restaurant ? shortCategory(restaurant.category) : '';
    } else {
      const shown = restaurants.filter(
        (restaurant) => (route.cat === null || restaurant.category === route.cat) && matches(restaurant, route.q),
      ).length;
      count.textContent = `顯示 ${shown} 間`;
    }
  }
  const select = document.querySelector<HTMLSelectElement>('#sort');
  if (select && route.view === 'list' && document.activeElement !== select) select.value = route.sort;
  const input = document.querySelector<HTMLInputElement>('#q');
  if (input && route.view === 'list' && document.activeElement !== input) input.value = route.q;
  const pill = document.querySelector<HTMLAnchorElement>('#home-pill');
  if (pill) {
    const onHome = route.view === 'list' && route.cat === null && route.q === '' && route.sort === 'score';
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
  syncMastHeight();
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
      const route = parseRoute(currentHash());
      const sortKey = route.view === 'list' ? route.sort : sortValue();
      const category = route.view === 'list' ? route.cat : null;
      go(listHash(category, input.value, sortKey), 'replace', 'auto');
    }, 160);
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    const route = parseRoute(currentHash());
    const sortKey = route.view === 'list' ? route.sort : sortValue();
    const category = route.view === 'list' ? route.cat : null;
    go(listHash(category, input.value, sortKey), 'push', true);
  });

  chips?.addEventListener('click', (event) => {
    window.clearTimeout(searchTimer);
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-cat]');
    if (!button) return;
    const category = button.dataset.cat || null;
    const route = parseRoute(currentHash());
    const sortKey = route.view === 'list' ? route.sort : sortValue();
    go(listHash(category, input.value, sortKey), 'push', true);
  });

  sort?.addEventListener('change', () => {
    window.clearTimeout(searchTimer);
    const route = parseRoute(currentHash());
    const category = route.view === 'list' ? route.cat : null;
    const query = route.view === 'list' ? route.q : input.value;
    go(listHash(category, query, sortValue()), 'push', true);
  });

  document.body.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('a, button')) window.clearTimeout(searchTimer);
    const street = target.closest<HTMLElement>('[data-street]');
    if (street?.dataset.street) {
      const name = street.dataset.street;
      const route = parseRoute(currentHash());
      const sortKey = route.view === 'list' ? route.sort : sortValue();
      const nextQuery = route.view === 'list' && route.q === name ? '' : name;
      input.value = nextQuery;
      go(listHash(null, nextQuery, sortKey), 'push', true);
      return;
    }
    if (target.closest('#clear-filters')) {
      input.value = '';
      go('/', 'push', true);
    }
  });

  window.addEventListener('hashchange', () => {
    window.clearTimeout(searchTimer);
    focusHeading = location.hash.startsWith('#/r/');
    render({ scroll: true });
  });

  window.addEventListener('resize', syncMastHeight);

  window.addEventListener('keydown', (event) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = document.activeElement?.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    event.preventDefault();
    input.focus();
  });
}

bind();
render();
syncMastHeight();

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
