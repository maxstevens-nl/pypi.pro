function isEdgeNoise(c: number): boolean {
  return c <= 32 || c === 34 /* " */ || c === 39 /* ' */;
}

function stripEdges(s: string): string {
  let lo = 0;
  let hi = s.length;
  while (lo < hi && isEdgeNoise(s.charCodeAt(lo))) lo++;
  while (hi > lo && isEdgeNoise(s.charCodeAt(hi - 1))) hi--;
  return s.slice(lo, hi);
}

export function parseKeywords(keywords: string): string[] {
  let s = keywords.trim();

  // Drop a single pair of matching quotes or brackets wrapping the whole string.
  while (s.length >= 2) {
    const first = s.charCodeAt(0);
    const last = s.charCodeAt(s.length - 1);
    const wrapped =
      (first === 34 && last === 34) ||
      (first === 39 && last === 39) ||
      (first === 40 && last === 41) ||
      (first === 91 && last === 93) ||
      (first === 123 && last === 125);
    if (wrapped) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }

  if (s.length === 0) return [];

  const tokens: string[] = [];
  const n = s.length;

  if (s.indexOf(",") !== -1) {
    let start = 0;
    for (let i = 0; i <= n; i++) {
      if (i === n || s.charCodeAt(i) === 44 /* , */) {
        const token = stripEdges(s.slice(start, i));
        if (token.length > 0) tokens.push(token);
        start = i + 1;
      }
    }
  } else {
    let i = 0;
    while (i < n) {
      while (i < n && s.charCodeAt(i) <= 32) i++;
      if (i >= n) break;

      if (s.charCodeAt(i) === 34 /* " */) {
        const close = s.indexOf('"', i + 1);
        if (close === -1) {
          const token = stripEdges(s.slice(i));
          if (token.length > 0) tokens.push(token);
          break;
        }
        const token = stripEdges(s.slice(i + 1, close));
        if (token.length > 0) tokens.push(token);
        i = close + 1;
      } else {
        let j = i;
        while (j < n && s.charCodeAt(j) > 32) j++;
        const token = stripEdges(s.slice(i, j));
        if (token.length > 0) tokens.push(token);
        i = j;
      }
    }
  }

  return tokens;
}
