import { describe, expect, test } from "bun:test";
import { sanitizeFtsTerm, buildSearchQuery } from "../src/query";

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
  test("empty string", () => {
    const result = buildSearchQuery("");
    expect(result.term).toBe('""');
    expect(result.isPrefix).toBe(false);
  });

  test("single char", () => {
    const result = buildSearchQuery("a");
    expect(result.isPrefix).toBe(false);
  });

  test("two chars", () => {
    const result = buildSearchQuery("ab");
    expect(result.isPrefix).toBe(true);
  });
});
