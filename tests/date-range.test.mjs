import assert from "node:assert/strict";
import test from "node:test";
import {
  dateRangeBounds,
  inDateRange,
  overlapsDateRange,
  dateRangeLabel,
} from "../lib/date-range.ts";

test("períodos incluem os dois dias completos em Brasília e atravessam meses e anos", () => {
  const range = "2026-11-25..2027-01-03";
  assert.equal(inDateRange("2026-11-25T02:59:59Z", range), false);
  assert.equal(inDateRange("2026-11-25T03:00:00Z", range), true);
  assert.equal(inDateRange("2027-01-04T02:59:59Z", range), true);
  assert.equal(inDateRange("2027-01-04T03:00:00Z", range), false);
  assert.equal(inDateRange("2026-12-05", range), true);
  assert.equal(inDateRange(null, range), false);
});

test("permite limites abertos, limpar o período e consultar competências antigas", () => {
  assert.equal(inDateRange("2027-05-04", "2026-11-25.."), true);
  assert.equal(inDateRange("2025-01-01", "..2026-11-25"), true);
  assert.equal(inDateRange("2025-01-01", ""), true);
  assert.deepEqual(dateRangeBounds("2028-02"), {
    from: "2028-02-01",
    to: "2028-02-29",
  });
  assert.equal(inDateRange("2026-12", "2026-11-25..2027-01-03"), true);
  assert.equal(inDateRange("2027-02", "2026-11-25..2027-01-03"), false);
  assert.equal(
    overlapsDateRange("2026-10-01", "2026-11-30", "2026-11-25..2026-12-10"),
    true,
  );
  assert.equal(
    overlapsDateRange("2026-10-01", "2026-11-24", "2026-11-25..2026-12-10"),
    false,
  );
  assert.equal(
    dateRangeLabel("2026-11-25..2027-01-03"),
    "25/11/2026 a 03/01/2027",
  );
});

test("comparações comerciais usam um intervalo anterior com a mesma duração", async () => {
  const { commercialAnalyticsPeriod, previousCommercialPeriod } =
    await import("../lib/commercial-analytics.ts");
  const selected = commercialAnalyticsPeriod("range", "2026-11-25..2027-01-03");
  assert.equal(selected.start, "2026-11-25");
  assert.equal(selected.end, "2027-01-03");
  const previous = previousCommercialPeriod(selected, "range");
  assert.equal(previous.start, "2026-10-16");
  assert.equal(previous.end, "2026-11-24");
});
