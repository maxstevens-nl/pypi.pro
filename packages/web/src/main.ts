const input = document.querySelector<HTMLInputElement>("#q")!;
const list = document.querySelector<HTMLUListElement>("#results")!;

let selectedIndex = -1;
let searchToken = 0;

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
  selectedIndex = -1;
  const q = input.value.trim();
  updateUrl(q);
  void search(q);
});

const initialQuery = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
input.value = initialQuery;
void search(initialQuery);

async function search(q: string) {
  const token = ++searchToken;
  if (!q) {
    list.innerHTML = "";
    void ping();
    return;
  }
  const base = import.meta.env.VITE_API_URL ?? "";
  const res = await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`);
  if (token !== searchToken) return;
  const { hits } = await res.json();
  if (token !== searchToken) return;
  renderResults(hits);
}

async function ping() {
  const base = import.meta.env.VITE_API_URL ?? "";
  await fetch(`${base}/api/search?q=`);
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
          <span class="downloads">${formatDownloads(h.downloads_4w ?? 0)}</span>
        </div>
      </a>
    </li>`,
    )
    .join("");
}

function formatDownloads(count: number): string {
  if (count >= 1_000_000_000) return (count / 1_000_000_000).toFixed(1) + "B";
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + "M";
  if (count >= 1_000) return (count / 1_000).toFixed(1) + "K";
  return count.toString();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
