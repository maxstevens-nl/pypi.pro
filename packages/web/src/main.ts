const input = document.querySelector<HTMLInputElement>("#q")!;
const list = document.querySelector<HTMLUListElement>("#results")!;

let selectedIndex = -1;
let searchToken = 0;
let debounceTimer: ReturnType<typeof setTimeout>;
const activeControllers = new Set<AbortController>();
const searchCache = new Map<string, any[]>();

input.focus();

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== input) {
    const target = e.target as HTMLElement;
    if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    e.preventDefault();
    input.focus();
  }
});

input.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  selectedIndex = -1;
  const q = input.value.trim();
  updateUrl(q);
  debounceTimer = setTimeout(() => startSearch(q), 75);
});

const initialQuery = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
if (initialQuery) {
  input.value = initialQuery;
  startSearch(initialQuery);
}

async function startSearch(q: string) {
  const token = ++searchToken;
  if (!q) {
    list.innerHTML = "";
    return;
  }

  const key = q.toLowerCase();
  const cached = searchCache.get(key);
  if (cached) {
    renderResults(cached);
    activeControllers.forEach((c) => c.abort());
    activeControllers.clear();
    return;
  }

  const controller = new AbortController();
  const signal = controller.signal;
  activeControllers.add(controller);

  const base = import.meta.env.VITE_API_URL ?? "";
  try {
    const res = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`, { signal });
    if (!res.ok) throw new Error(`Search request failed with HTTP ${res.status}`);
    if (token !== searchToken) return;
    const { hits } = await res.json();
    if (token !== searchToken) return;
    searchCache.set(key, hits);
    if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value!);
    renderResults(hits);
    activeControllers.forEach((c) => { if (c !== controller) c.abort(); });
    activeControllers.clear();
  } catch (error: any) {
    if (error?.name === "AbortError") return;
    console.error("Search request failed", error);
  }
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
  }
});

function updateSelection(items: NodeListOf<HTMLLIElement>) {
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === selectedIndex);
  });
  items[selectedIndex]?.scrollIntoView({ block: "nearest" });
}

function renderResults(hits: any[]) {
  list.innerHTML = hits
    .map(
      (h: any) =>
        `<li>
      <a href="https://pypi.org/project/${escapeHtml(h.name ?? "")}/">
        <strong>${escapeHtml(h.name ?? "")}</strong>
        <div class="meta">
          <span>${escapeHtml(h.summary ?? "")}</span>
        </div>
      </a>
    </li>`,
    )
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
