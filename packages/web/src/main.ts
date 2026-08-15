const input = document.querySelector<HTMLInputElement>("#q")!;
const list = document.querySelector<HTMLUListElement>("#results")!;
const pkgEl = document.querySelector<HTMLDivElement>("#package")!;

let selectedIndex = -1;
let searchToken = 0;
let lastRenderedToken = 0;
const pendingControllers = new Map<number, AbortController>();
const searchCache = new Map<string, any[]>();
const packageCache = new Map<string, any>();

const TYPESENSE_URL = import.meta.env.VITE_TYPESENSE_URL;
const TYPESENSE_API_KEY = import.meta.env.VITE_TYPESENSE_API_KEY;

input.focus();

const PACKAGE_PATH = /^\/project\/(.+)$/;

function currentPackageName(): string | null {
  const match = window.location.pathname.match(PACKAGE_PATH);
  return match ? decodeURIComponent(match[1]) : null;
}

function showSearch() {
  pkgEl.hidden = true;
  list.hidden = false;
  input.hidden = false;
}

function showPackage() {
  list.hidden = true;
  input.hidden = true;
  pkgEl.hidden = false;
}

function route() {
  const name = currentPackageName();
  if (name) {
    showPackage();
    renderPackagePage(name);
  } else {
    showSearch();
    restoreSearchFromUrl();
  }
}

function restoreSearchFromUrl() {
  const q = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
  if (q) {
    input.value = q;
    startSearch(q);
  } else {
    input.value = "";
    list.innerHTML = "";
  }
}

window.addEventListener("popstate", route);

document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0) return;
  const target = (e.target as HTMLElement).closest("a");
  if (!target) return;
  if (target.hasAttribute("data-back")) {
    e.preventDefault();
    history.back();
    return;
  }
  const url = new URL(target.href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  e.preventDefault();
  window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  route();
});

document.addEventListener("keydown", (e) => {
  if (document.activeElement !== input) {
    const target = e.target as HTMLElement;
    const key = e.key.toLowerCase();
    if (e.key === "/") {
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
        return;
      e.preventDefault();
      input.focus();
      return;
    }
    if (key === "arrowdown" || key === "j") {
      const items = list.querySelectorAll("li");
      if (items.length === 0) return;
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items);
    } else if (key === "arrowup" || key === "k") {
      const items = list.querySelectorAll("li");
      if (items.length === 0) return;
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      updateSelection(items);
    } else if (key === "enter") {
      const items = list.querySelectorAll("li");
      if (items.length === 0) return;
      e.preventDefault();
      const link = items[selectedIndex >= 0 ? selectedIndex : 0]?.querySelector("a");
      if (link) (link as HTMLAnchorElement).click();
    }
  }
});

input.addEventListener("input", () => {
  ++searchToken;
  selectedIndex = -1;
  const q = input.value.trim();
  updateUrl(q);
  if (!q) {
    list.innerHTML = "";
    return;
  }
  startSearch(q);
});

async function startSearch(q: string) {
  const token = searchToken;
  const controller = new AbortController();
  pendingControllers.set(token, controller);

  const key = q.toLowerCase();
  const cached = searchCache.get(key);
  if (cached) {
    commitSearch(token, cached);
    return;
  }

  try {
    const res = await fetch(
      `${TYPESENSE_URL}/collections/packages/documents/search?q=${encodeURIComponent(q)}&query_by=normalized_name`,
      {
        headers: {
          "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY,
        },
        signal: controller.signal,
      },
    );

    if (!res.ok) throw new Error(`Search request failed with HTTP ${res.status}`);
    if (token < lastRenderedToken) return;
    const { hits } = await res.json();
    if (token < lastRenderedToken) return;
    searchCache.set(key, hits);
    if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value!);
    commitSearch(token, hits);
  } catch (error: any) {
    if (error?.name === "AbortError") return;
    console.error("Search request failed", error);
  } finally {
    pendingControllers.delete(token);
  }
}

function commitSearch(token: number, hits: any[]) {
  for (const [t, c] of pendingControllers) {
    if (t < token) c.abort();
  }
  lastRenderedToken = token;
  pendingControllers.delete(token);
  renderResults(hits);
}

function updateUrl(q: string) {
  const url = new URL(window.location.href);
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

input.addEventListener("keydown", (e) => {
  const items = list.querySelectorAll("li");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    updateSelection(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, -1);
    updateSelection(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const link = items[selectedIndex >= 0 ? selectedIndex : 0]?.querySelector("a");
    if (link) (link as HTMLAnchorElement).click();
  } else if (e.key === "Escape") {
    e.preventDefault();
    input.blur();
  }
});

function updateSelection(items: NodeListOf<HTMLLIElement>) {
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === selectedIndex);
  });
  items[selectedIndex]?.scrollIntoView({ block: "nearest" });
}

function resultHref(name: string): string {
  return `/project/${encodeURIComponent(name)}`;
}

function fromTypesenseDoc(doc: any): any {
  return {
    name: doc.name,
    summary: doc.summary,
    version: doc.version,
    homePage: doc.home_page,
    updatedAt: doc.updated_at,
    description: doc.description,
    author: doc.author,
    license: doc.license,
    classifiers: doc.classifiers,
    requiresPython: doc.requires_python,
    keywords: doc.keywords,
    downloads4w: doc.downloads_4w,
    importNames: doc.import_names,
  };
}

function renderResults(hits: any[]) {
  list.innerHTML = hits
    .map((h: any) => {
      const doc = h.document ?? {};
      const nameSnippet = h.highlight?.normalized_name?.snippet;
      const name = nameSnippet ?? escapeHtml(doc.name ?? "");
      if (doc.name) packageCache.set(doc.name, fromTypesenseDoc(doc));
      return `<li>
      <a href="${resultHref(doc.name ?? "")}">
        <div class="name-row">
          <strong>${name}</strong>
          ${
            Array.isArray(doc.import_names) && doc.import_names.length > 0
              ? doc.import_names
                  .map((n: string) => `<code class="import">${escapeHtml(n)}</code>`)
                  .join("")
              : ""
          }
        </div>
        <div class="meta">
          <span>${escapeHtml(doc.summary ?? "")}</span>
        </div>
      </a>
    </li>`;
    })
    .join("");
}

async function renderPackagePage(name: string) {
  const back = `<a class="pkg-back" href="/" data-back>&larr; Back to search</a>`;

  pkgEl.innerHTML = `${back}<h2 class="pkg-title">${escapeHtml(name)}</h2><p class="pkg-loading">Loading…</p>`;

  const cached = packageCache.get(name);
  if (cached) {
    renderPackage(cached, back);
    return;
  }

  try {
    const res = await fetch(
      `${TYPESENSE_URL}/collections/packages/documents/${encodeURIComponent(name)}`,
      { headers: { "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY } },
    );
    if (!res.ok) throw new Error(`Package request failed with HTTP ${res.status}`);
    const doc = await res.json();
    const pkg = fromTypesenseDoc(doc);
    packageCache.set(name, pkg);
    renderPackage(pkg, back);
  } catch (error) {
    console.error("Package request failed", error);
    pkgEl.innerHTML = `${back}<h2 class="pkg-title">${escapeHtml(name)}</h2><p class="pkg-loading">Failed to load package.</p>`;
  }
}

function renderPackage(p: any, back: string) {
  const downloads4w = Number(p.downloads4w);
  const downloads = !downloads4w ? "—" : formatNumber(downloads4w);
  const updated = p.updatedAt == null ? null : formatDate(Number(p.updatedAt));
  const homePage =
    typeof p.homePage === "string" && /^https?:\/\//.test(p.homePage) ? p.homePage : null;
  const importNames: string[] = Array.isArray(p.importNames) ? p.importNames : [];
  const classifiers: string[] = Array.isArray(p.classifiers) ? p.classifiers : [];
  const keywords: string[] = (typeof p.keywords === "string" ? p.keywords : "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const stats = `<div class="pkg-stats">
          <div class="pkg-stat"><span class="label">Downloads (30d)</span><span class="value">${downloads}</span></div>
          ${updated !== null ? `<div class="pkg-stat"><span class="label">Last updated</span><span class="value">${updated}</span></div>` : ""}
          ${p.requiresPython != null ? `<div class="pkg-stat"><span class="label">Requires Python</span><span class="value">${escapeHtml(p.requiresPython)}</span></div>` : ""}
        </div>`;

  const importSection =
    importNames.length > 0
      ? `<div class="pkg-imports"><span class="label">Import names</span>${importNames
          .map((n) => `<code class="import">${escapeHtml(n)}</code>`)
          .join("")}</div>`
      : "";

  const keywordSection =
    keywords.length > 0
      ? `<div class="pkg-keywords"><span class="label">Keywords</span>${keywords
          .map((k) => `<span class="tag">${escapeHtml(k)}</span>`)
          .join("")}</div>`
      : "";

  const description =
    typeof p.description === "string" && p.description.trim()
      ? `<div class="pkg-desc"><h3>Description</h3><pre>${escapeHtml(p.description)}</pre></div>`
      : "";

  const metaRows: string[] = [];
  if (p.author != null) metaRows.push(metaRow("Author", escapeHtml(p.author)));
  if (p.license != null) metaRows.push(metaRow("License", escapeHtml(p.license)));
  if (homePage)
    metaRows.push(
      `<div class="meta-row"><dt>Home page</dt><dd><a href="${escapeHtml(homePage)}" target="_blank" rel="noopener noreferrer">${escapeHtml(homePage)}</a></dd></div>`,
    );

  const meta = metaRows.length > 0 ? `<dl class="pkg-meta">${metaRows.join("")}</dl>` : "";

  const classifiersSection =
    classifiers.length > 0
      ? `<details class="pkg-classifiers"><summary>Classifiers (${classifiers.length})</summary><ul>${classifiers
          .map((c) => `<li>${escapeHtml(c)}</li>`)
          .join("")}</ul></details>`
      : "";

  const external = `<div class="pkg-external"><a href="https://pypi.org/project/${encodeURIComponent(p.name ?? "")}/" target="_blank" rel="noopener noreferrer">View on PyPI &nearr;</a></div>`;

  pkgEl.innerHTML = `${back}
    <h2 class="pkg-title">${escapeHtml(p.name ?? "")}${p.version != null ? `<span class="pkg-version">${escapeHtml(p.version)}</span>` : ""}</h2>
    ${p.summary != null && p.summary.trim() ? `<p class="pkg-summary">${escapeHtml(p.summary)}</p>` : ""}
    ${importSection}
    ${stats}
    ${keywordSection}
    ${description}
    ${meta}
    ${classifiersSection}
    ${external}`;
}

function metaRow(label: string, value: string): string {
  return `<div class="meta-row"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

route();
