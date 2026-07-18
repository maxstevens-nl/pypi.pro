const input = document.querySelector<HTMLInputElement>("#q")!;
const list = document.querySelector<HTMLUListElement>("#results")!;

let timer: ReturnType<typeof setTimeout>;
let selectedIndex = -1;

input.addEventListener("input", () => {
  clearTimeout(timer);
  selectedIndex = -1;
  timer = setTimeout(async () => {
    const q = input.value.trim();
    if (!q) {
      list.innerHTML = "";
      return;
    }
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const { hits } = await res.json();
    renderResults(hits);
  }, 80);
});

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
  } else if (e.key === "Enter" && selectedIndex >= 0) {
    e.preventDefault();
    const link = items[selectedIndex]?.querySelector("a");
    if (link) (link as HTMLAnchorElement).click();
  }
});

function updateSelection(items: NodeListOf<HTMLLIElement>) {
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === selectedIndex);
  });
}

function renderResults(hits: any[]) {
  list.innerHTML = hits.map((h: any) =>
    `<li>
      <a href="https://pypi.org/project/${escapeHtml(h.name)}/">
        <strong>${escapeHtml(h.display_name)}</strong>
        <div class="meta">
          <span>${escapeHtml(h.summary ?? "")}</span>
          <span class="downloads">${formatDownloads(h.downloads_4w ?? 0)}</span>
        </div>
      </a>
    </li>`
  ).join("");
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
