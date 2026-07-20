export function sanitizeFtsTerm(input: string): string {
  const cleaned = input
    .replace(/["""\u201C\u201D\u201E]/g, " ")
    .replace(/[*():^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return '""';
  return cleaned
    .split(" ")
    .map((t) => `"${t}"`)
    .join(" ");
}

export function buildSearchQuery(raw: string): { term: string; isPrefix: boolean } {
  if (!raw.trim()) {
    return { term: '""', isPrefix: false };
  }
  const term = sanitizeFtsTerm(raw);
  const isPrefix = raw.length >= 2;
  return { term, isPrefix };
}
