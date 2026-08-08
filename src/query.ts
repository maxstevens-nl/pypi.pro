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

export function buildSearchQuery(raw: string): {
  prefixPattern: string;
  needsTrgm: boolean;
  needsFts: boolean;
  tsQueryParam: string;
} {
  const cleaned = sanitizeFtsTerm(raw);

  if (!cleaned || cleaned === '""') {
    return {
      prefixPattern: `${raw}%`,
      needsTrgm: false,
      needsFts: false,
      tsQueryParam: '""',
    };
  }

  const terms = cleaned.split(" ");
  const tsQueryParam =
    terms.length === 1
      ? `${terms[0]}:*`
      : `${terms.slice(0, -1).join(" & ")} & ${terms[terms.length - 1]}:*`;

  const needsTrgm = raw.length >= 3;
  const needsFts = raw.length >= 3;

  return {
    prefixPattern: `${raw}%`,
    needsTrgm,
    needsFts,
    tsQueryParam,
  };
}
