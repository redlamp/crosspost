import { describe, expect, it } from "vitest";

import { version } from "../../package.json";
import { CHANGELOG, splitLatest, type Release } from "./changelog";

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

describe("splitLatest", () => {
  const r = (version: string): Release => ({ version, date: "2026-10-25", changes: ["x"] });

  it("leads with the newest minor release and its patches", () => {
    const { latest, earlier } = splitLatest([r("1.3.1"), r("1.3.0"), r("1.2.2"), r("1.2.0")]);
    expect(latest.map((x) => x.version)).toEqual(["1.3.1", "1.3.0"]);
    expect(earlier.map((x) => x.version)).toEqual(["1.2.2", "1.2.0"]);
  });

  it("keeps everything up front when there's only one minor release", () => {
    expect(splitLatest([r("1.0.1"), r("1.0.0")]).earlier).toEqual([]);
  });
});
