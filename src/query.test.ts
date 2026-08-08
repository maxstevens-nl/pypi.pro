import { describe, expect, test } from "bun:test";
import { sanitizeFtsTerm, buildSearchQuery } from "./query";

describe("sanitizeFtsTerm", () => {
  test("empty string returns empty quoted string", () => {
    expect(sanitizeFtsTerm("")).toBe('""');
  });

  test("strips double quotes", () => {
    expect(sanitizeFtsTerm('a"b')).toBe('"a" "b"');
  });

  test("strips unicode quotes", () => {
    expect(sanitizeFtsTerm("a\u201Cb")).toBe('"a" "b"');
  });

  test("strips FTS operators", () => {
    expect(sanitizeFtsTerm("a*b:c^d-e")).toBe('"a" "b" "c" "d-e"');
  });

  test("handles c++", () => {
    expect(sanitizeFtsTerm("c++")).toBe('"c++"');
  });

  test("handles node-fetch", () => {
    expect(sanitizeFtsTerm("node-fetch")).toBe('"node-fetch"');
  });

  test("handles asterisk alone", () => {
    expect(sanitizeFtsTerm("*")).toBe('""');
  });

  test("handles multiple spaces", () => {
    expect(sanitizeFtsTerm("a   b   c")).toBe('"a" "b" "c"');
  });

  test("handles unicode", () => {
    expect(sanitizeFtsTerm("café")).toBe('"café"');
  });

  test("handles SQL injection attempt", () => {
    expect(sanitizeFtsTerm("; DROP TABLE packages")).toBe('";" "DROP" "TABLE" "packages"');
  });

  test("handles 200-char string without throwing", () => {
    const long = "a".repeat(200);
    expect(sanitizeFtsTerm(long)).toBe(`"${long}"`);
  });

  test("handles parentheses", () => {
    expect(sanitizeFtsTerm("foo(bar)")).toBe('"foo" "bar"');
  });
});

describe("buildSearchQuery", () => {
  test("empty string disables trgm and fts legs", () => {
    const result = buildSearchQuery("");
    expect(result.prefixPattern).toBe("%");
    expect(result.needsTrgm).toBe(false);
    expect(result.needsFts).toBe(false);
    expect(result.tsQueryParam).toBe('""');
  });

  test("single char disables trgm and fts", () => {
    const result = buildSearchQuery("a");
    expect(result.prefixPattern).toBe("a%");
    expect(result.needsTrgm).toBe(false);
    expect(result.needsFts).toBe(false);
  });

  test("three chars enables trgm and fts", () => {
    const result = buildSearchQuery("abc");
    expect(result.prefixPattern).toBe("abc%");
    expect(result.needsTrgm).toBe(true);
    expect(result.needsFts).toBe(true);
    expect(result.tsQueryParam).toBe('"abc":*');
  });

  test("single-term query adds prefix wildcard", () => {
    const result = buildSearchQuery("django");
    expect(result.tsQueryParam).toBe('"django":*');
  });

  test("multi-term query joins with & and prefixes last term", () => {
    const result = buildSearchQuery("http requests");
    expect(result.tsQueryParam).toBe('"http" & "requests":*');
  });

  test("strips dangerous characters before building tsquery", () => {
    const result = buildSearchQuery('a"b');
    expect(result.tsQueryParam).toBe('"a" & "b":*');
  });

  test("handles three terms", () => {
    const result = buildSearchQuery("data science toolkit");
    expect(result.tsQueryParam).toBe('"data" & "science" & "toolkit":*');
  });
});
