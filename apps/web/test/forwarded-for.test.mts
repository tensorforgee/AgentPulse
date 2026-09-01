import assert from "node:assert/strict";
import { test } from "node:test";
import { forwardedForHeader } from "../src/lib/forwarded-for.ts";

function headers(value?: string) {
  return {
    get(name: string) {
      return name.toLowerCase() === "x-forwarded-for" && value !== undefined
        ? value
        : null;
    },
  };
}

test("replays the chain Caddy set for the real client", () => {
  assert.equal(forwardedForHeader(headers("203.0.113.7")), "203.0.113.7");
});

test("normalizes whitespace without reordering the chain", () => {
  assert.equal(
    forwardedForHeader(headers(" 203.0.113.7 ,  198.51.100.4 ")),
    "203.0.113.7, 198.51.100.4",
  );
});

test("keeps the right-most entry last so the API resolves the client", () => {
  const chain = forwardedForHeader(headers("198.51.100.4, 203.0.113.7"));
  assert.equal(chain?.split(", ").at(-1), "203.0.113.7");
});

test("returns null when no forwarding header is present", () => {
  assert.equal(forwardedForHeader(headers()), null);
});

test("returns null for an empty or comma-only header", () => {
  assert.equal(forwardedForHeader(headers("")), null);
  assert.equal(forwardedForHeader(headers(" , ")), null);
});
