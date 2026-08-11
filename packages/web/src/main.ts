import { setDefaultConfiguration, collection } from "typesense-ts";

setDefaultConfiguration({
  apiKey: "9rwcbkpgygdsarm2z6db9x9eh7elb5kk",
  nodes: [{ url: "https://typesense-production-f140.up.railway.app" }],
});

const packagesSchema = collection({
  name: "books",
  fields: [
    { name: "title", type: "string" },
    { name: "authors", type: "string[]" },
    { name: "publication_year", type: "int32", sort: true },
    { name: "ratings_count", type: "int32", facet: true },
    { name: "average_rating", type: "float", facet: true },
    { name: "categories", type: "string[]", facet: true },
  ],
  default_sorting_field: "publication_year",
});

declare module "typesense-ts" {
  interface Collections {
    packages: typeof packagesSchema.schema;
  }
}

const input = document.querySelector<HTMLInputElement>("#q")!;
const list = document.querySelector<HTMLUListElement>("#results")!;
const pkgEl = document.querySelector<HTMLDivElement>("#package")!;

let selectedIndex = -1;
let searchToken = 0;
let lastRenderedToken = 0;
const pendingControllers = new Map<number, AbortController>();
const searchCache = new Map<string, any[]>();

input.focus();

const PACKAGE_PATH = /^\/packages\/(.+)$/;

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

  const base = import.meta.env.VITE_API_URL ?? "";
  try {
    const searchResults = await packagesSchema.search({
      q,
      per_page: 20,
      signal: controller.signal,
    });

    const res = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    });
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
  const q = input.value.trim();
  const base = `/packages/${encodeURIComponent(name)}`;
  return q ? `${base}?q=${encodeURIComponent(q)}` : base;
}

function renderResults(hits: any[]) {
  list.innerHTML = hits
    .map(
      (h: any) =>
        `<li>
      <a href="${resultHref(h.name ?? "")}">
        <div class="name-row">
          <strong>${escapeHtml(h.name ?? "")}</strong>
          ${
            Array.isArray(h.import_names) && h.import_names.length > 0
              ? h.import_names
                  .map((n: string) => `<code class="import">${escapeHtml(n)}</code>`)
                  .join("")
              : ""
          }
        </div>
        <div class="meta">
          <span>${escapeHtml(h.summary ?? "")}</span>
        </div>
      </a>
    </li>`,
    )
    .join("");
}

async function renderPackagePage(name: string) {
  const currentQuery = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
  const backHref = currentQuery ? `/?q=${encodeURIComponent(currentQuery)}` : "/";
  const back = `<a class="pkg-back" href="${backHref}">&larr; Back to search</a>`;

  pkgEl.innerHTML = `${back}<h2 class="pkg-title">${escapeHtml(name)}</h2><p class="pkg-loading">Loading…</p>`;

  const base = import.meta.env.VITE_API_URL ?? "";
  try {
    const res = await fetch(`${base}/api/packages/${encodeURIComponent(name)}`);
    if (res.status === 404) {
      pkgEl.innerHTML = `${back}<h2 class="pkg-title">${escapeHtml(name)}</h2><p class="pkg-not-found">Package not found.</p>`;
      return;
    }
    if (!res.ok) throw new Error(`Package request failed with HTTP ${res.status}`);
    const pkg = await res.json();
    renderPackage(pkg, back);
  } catch (error) {
    console.error("Package request failed", error);
    pkgEl.innerHTML = `${back}<h2 class="pkg-title">${escapeHtml(name)}</h2><p class="pkg-error">Failed to load package.</p>`;
  }
}

function renderPackage(p: any, back: string) {
  const downloads = p.downloads4w == null ? null : formatNumber(Number(p.downloads4w));
  const updated = p.updatedAt == null ? null : formatDate(Number(p.updatedAt));
  const homePage =
    typeof p.homePage === "string" && /^https?:\/\//.test(p.homePage) ? p.homePage : null;
  const importNames: string[] = Array.isArray(p.importNames) ? p.importNames : [];
  const classifiers: string[] = Array.isArray(p.classifiers) ? p.classifiers : [];
  const keywords: string[] = (typeof p.keywords === "string" ? p.keywords : "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const stats =
    downloads !== null || updated !== null || p.requiresPython != null
      ? `<div class="pkg-stats">
          ${downloads !== null ? `<div class="pkg-stat"><span class="label">Downloads (30d)</span><span class="value">${downloads}</span></div>` : ""}
          ${updated !== null ? `<div class="pkg-stat"><span class="label">Last updated</span><span class="value">${updated}</span></div>` : ""}
          ${p.requiresPython != null ? `<div class="pkg-stat"><span class="label">Requires Python</span><span class="value">${escapeHtml(p.requiresPython)}</span></div>` : ""}
        </div>`
      : "";

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
