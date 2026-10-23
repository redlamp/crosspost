import { describe, expect, it } from "vitest";

import { version } from "../../package.json";
import { CHANGELOG } from "./changelog";

describe("CHANGELOG", () => {
  it("leads with the version in package.json", () => {
    expect(CHANGELOG[0].version).toBe(version);
  });

  it("is newest first, each with a date and changes", () => {
    const dates = CHANGELOG.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const r of CHANGELOG) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.changes.length).toBeGreaterThan(0);
    }
  });
});
