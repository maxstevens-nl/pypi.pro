function isEdgeNoise(c: number): boolean {
  return (
    c <= 32 ||
    c === 34 /* " */ ||
    c === 39 /* ' */ ||
    c === 40 /* ( */ ||
    c === 41 /* ) */ ||
    c === 91 /* [ */ ||
    c === 93 /* ] */ ||
    c === 123 /* { */ ||
    c === 125 /* } */
  );
}

export function parseKeywords(keywords: string): string[] {
  const result: string[] = [];
  const n = keywords.length;
  const commaMode = keywords.indexOf(",") !== -1;

  let i = 0;
  while (i < n) {
    // occurs in comma mode; the check is unconditional to keep it cheap.)
    while (i < n) {
      const c = keywords.charCodeAt(i);
      if (c > 32 && c !== 44 /* , */) break;
      i++;
    }
    if (i >= n) break;

    if (keywords.charCodeAt(i) === 34 /* " */) {
      // Double-quoted phrase: keep everything up to the closing quote.
      const quote = i;
      i++;
      const start = i;
      while (i < n && keywords.charCodeAt(i) !== 34 /* " */) i++;
      if (i < n) {
        if (i > start) result.push(keywords.slice(start, i));
        i++; // skip the closing quote
        continue;
      }
      // Unterminated quote: fall through and re-parse as a bare token —
      // the stray quote is stripped as edge noise.
      i = quote;
    }

    // Bare token: consume until the next delimiter (comma, or whitespace
    // when no comma exists anywhere in the string).
    const start = i;
    while (i < n) {
      const c = keywords.charCodeAt(i);
      if (commaMode ? c === 44 /* , */ : c <= 32) break;
      i++;
    }

    // Strip stray whitespace, quotes, and brackets off both edges.
    let lo = start;
    let hi = i;
    while (lo < hi && isEdgeNoise(keywords.charCodeAt(lo))) lo++;
    while (hi > lo && isEdgeNoise(keywords.charCodeAt(hi - 1))) hi--;

    if (hi > lo) result.push(keywords.slice(lo, hi));
  }
  return result;
}
