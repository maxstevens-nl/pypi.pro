const input = document.querySelector<HTMLInputElement>("#q")!;
const list = document.querySelector<HTMLUListElement>("#results")!;

let selectedIndex = -1;
let searchToken = 0;
let lastRenderedToken = 0;
const pendingControllers = new Map<number, AbortController>();
const searchCache = new Map<string, any[]>();

input.focus();

document.addEventListener("keydown", (e) => {
  if (document.activeElement !== input) {
    const target = e.target as HTMLElement;
    const key = e.key.toLowerCase();
    if (e.key === "/") {
      if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      e.preventDefault();
      input.focus();
      return;
    }
    if (key === "ArrowDown" || key === "j") {
      const items = list.querySelectorAll("li");
      if (items.length === 0) return;
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items);
    } else if (key === "ArrowUp" || key === "k") {
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

const initialQuery = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
if (initialQuery) {
  input.value = initialQuery;
  startSearch(initialQuery);
}

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
    const res = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
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

function renderResults(hits: any[]) {
  list.innerHTML = hits
    .map(
      (h: any) =>
        `<li>
      <a href="https://pypi.org/project/${escapeHtml(h.name ?? "")}/">
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
