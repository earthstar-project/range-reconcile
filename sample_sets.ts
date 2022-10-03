import { ExchangeScenario } from "./types.ts";

/** Scenario where both have nothing. */
export const scenario0: ExchangeScenario = { a: [], b: [] };

/** Scenario where a has docs and b has nothing */
export const scenario1: ExchangeScenario = {
  a: [
    {
      path: "/a",
      author: "@alfa",
      timestamp: 1000,
    },
    {
      path: "/b",
      author: "@beta",
      timestamp: 2000,
    },
    {
      path: "/c",
      author: "@gema",
      timestamp: 3000,
    },
    {
      path: "/d",
      author: "@dalt",
      timestamp: 1000,
    },
    {
      path: "/e",
      author: "@epso",
      timestamp: 1000,
    },
  ],
  b: [],
};

/** Scenario where both sides have completely different items */
export const scenario2: ExchangeScenario = {
  a: [
    {
      path: "/a",
      author: "@alfa",
      timestamp: 1000,
    },
    {
      path: "/b",
      author: "@beta",
      timestamp: 2000,
    },
    {
      path: "/c",
      author: "@gema",
      timestamp: 3000,
    },
  ],
  b: [
    {
      path: "/d",
      author: "@dalt",
      timestamp: 4000,
    },
    {
      path: "/e",
      author: "@epso",
      timestamp: 5000,
    },
    {
      path: "/f",
      author: "@fred",
      timestamp: 5000,
    },
  ],
};

// Both sides have matching left side, unmatched right side

// Both sides have unmatched left side, matched right side

// Unmatched on both sides.
