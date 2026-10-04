"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  TAX_2026,
  DEFAULT_INPUT,
  federalMarginalRate,
  evaluate,
  judge,
  findCrossovers,
} = require("../calc.js");

const REFERENCE = [
  { billed: 0, hraShare: 0, hsaShare: 0, hraTotal: 2808, hsaTotal: -1806, winner: "HSA", advantage: 4614, hsaLeft: 8750 },
  { billed: 1500, hraShare: 1500, hsaShare: 1500, hraTotal: 2808, hsaTotal: -306, winner: "HSA", advantage: 3114, hsaLeft: 7250 },
  { billed: 4000, hraShare: 2000, hsaShare: 4000, hraTotal: 2808, hsaTotal: 2194, winner: "HSA", advantage: 614, hsaLeft: 4750 },
  { billed: 5000, hraShare: 2200, hsaShare: 4200, hraTotal: 2808, hsaTotal: 2394, winner: "HSA", advantage: 414, hsaLeft: 4550 },
  { billed: 10000, hraShare: 3200, hsaShare: 5200, hraTotal: 2808, hsaTotal: 3394, winner: "HRA", advantage: 586, hsaLeft: 3550 },
  { billed: 20000, hraShare: 5200, hsaShare: 7200, hraTotal: 4008, hsaTotal: 5394, winner: "HRA", advantage: 1386, hsaLeft: 1550 },
  { billed: 30000, hraShare: 7000, hsaShare: 8000, hraTotal: 5808, hsaTotal: 6194, winner: "HRA", advantage: 386, hsaLeft: 750 },
];

function withInput(patch) {
  return {
    ...DEFAULT_INPUT,
    ...patch,
    hra: { ...DEFAULT_INPUT.hra, ...(patch.hra || {}) },
    hsa: { ...DEFAULT_INPUT.hsa, ...(patch.hsa || {}) },
  };
}

test("default inputs match the 2026 reference table (payroll toggle off)", () => {
  assert.equal(DEFAULT_INPUT.payrollHsa, false);
  assert.equal(DEFAULT_INPUT.stateRate, 0);
  for (const expected of REFERENCE) {
    const judged = judge(evaluate(DEFAULT_INPUT, expected.billed));
    assert.deepEqual(judged, {
      hraShare: expected.hraShare,
      hsaShare: expected.hsaShare,
      hraTotal: expected.hraTotal,
      hsaTotal: expected.hsaTotal,
      hsaLeft: expected.hsaLeft,
      winner: expected.winner,
      advantage: expected.advantage,
    });
  }
});

test("HRA total stays $2,808 until member share passes the $4,000 deposit", () => {
  for (const billed of [0, 1500, 4000, 5000, 10000, 14000]) {
    const judged = judge(evaluate(DEFAULT_INPUT, billed));
    assert.ok(judged.hraShare <= 4000, `share at ${billed} was ${judged.hraShare}`);
    assert.equal(judged.hraTotal, 2808, `HRA total at ${billed}`);
  }

  const atDeposit = evaluate(DEFAULT_INPUT, 14000);
  assert.equal(atDeposit.hra.share, 4000);

  const past = judge(evaluate(DEFAULT_INPUT, 15000));
  assert.equal(past.hraShare, 4200);
  assert.equal(past.hraTotal, 3008);

  const zero = judge(evaluate(DEFAULT_INPUT, 0));
  assert.equal(zero.hsaTotal, -1806);
});

test("crossover with default inputs is about $7,070 of billed charges", () => {
  const crossings = findCrossovers(DEFAULT_INPUT);
  assert.equal(crossings.length, 1);
  const crossover = crossings[0];
  assert.ok(crossover > 7060 && crossover < 7080, `crossover was ${crossover}`);

  const atCross = evaluate(DEFAULT_INPUT, crossover);
  assert.ok(Math.abs(atCross.hra.total - atCross.hsa.total) < 0.05);

  const below = judge(evaluate(DEFAULT_INPUT, 5000));
  const above = judge(evaluate(DEFAULT_INPUT, 10000));
  assert.equal(below.winner, "HSA");
  assert.equal(above.winner, "HRA");
});

test("2026 brackets and deductions match IRS Rev. Proc. 2025-32 and 2025-19", () => {
  assert.equal(TAX_2026.standardDeduction.mfj, 32200);
  assert.equal(TAX_2026.standardDeduction.single, 16100);
  assert.equal(TAX_2026.hsaLimits.family, 8750);
  assert.equal(TAX_2026.hsaLimits.self, 4400);
  assert.equal(TAX_2026.ficaRate, 0.0765);

  const mfj = TAX_2026.brackets.mfj;
  const single = TAX_2026.brackets.single;
  assert.deepEqual(
    mfj.map((band) => band.upTo),
    [24800, 100800, 211400, 403550, 512450, 768700, Infinity]
  );
  assert.deepEqual(
    single.map((band) => band.upTo),
    [12400, 50400, 105700, 201775, 256225, 640600, Infinity]
  );
  for (let i = 0; i < 5; i++) {
    assert.equal(single[i].upTo, mfj[i].upTo / 2);
    assert.equal(single[i].rate, mfj[i].rate);
  }
  assert.equal(single[5].upTo, 640600);
  assert.notEqual(single[5].upTo, mfj[5].upTo / 2);

  assert.equal(federalMarginalRate(0, "mfj"), 0);
  assert.equal(federalMarginalRate(-1000, "mfj"), 0);
  assert.equal(federalMarginalRate(24800, "mfj"), 0.1);
  assert.equal(federalMarginalRate(24800.01, "mfj"), 0.12);
  assert.equal(federalMarginalRate(134200, "mfj"), 0.22);
  assert.equal(federalMarginalRate(768700, "mfj"), 0.35);
  assert.equal(federalMarginalRate(768700.01, "mfj"), 0.37);
  assert.equal(federalMarginalRate(640600, "single"), 0.35);
  assert.equal(federalMarginalRate(640600.01, "single"), 0.37);
});

test("default taxable income uses the premium for that plan and the 22% bracket", () => {
  const row = evaluate(DEFAULT_INPUT, 0);
  assert.equal(row.hra.taxableIncome, 134200);
  assert.equal(row.hsa.taxableIncome, 136648);
  assert.equal(row.hra.marginalRate, 0.22);
  assert.equal(row.hsa.marginalRate, 0.22);
  assert.equal(row.hra.afterTaxPremium, 2808);
  assert.ok(Math.abs(row.hsa.taxSavings - 1705) < 1e-6);
  assert.equal(row.hsa.employeeContribution, 7750);
});

test("employee HSA contribution is capped at the limit minus the employer deposit", () => {
  const row = evaluate(withInput({ hsa: { employeeContribution: 999999 } }), 0);
  assert.equal(row.hsa.employeeContribution, 7750);
  assert.ok(Math.abs(row.hsa.taxSavings - 1705) < 1e-6);
  const judged = judge(row);
  assert.equal(judged.hsaTotal, -1806);
});

test("HSA balance left for next year cannot go below zero", () => {
  const capped = judge(evaluate(DEFAULT_INPUT, 100000));
  assert.equal(capped.hsaShare, 8000);
  assert.equal(capped.hraShare, 7000);
  assert.equal(capped.hsaLeft, 750);

  const drained = judge(
    evaluate(withInput({ hsa: { employeeContribution: 0 } }), 100000)
  );
  assert.equal(drained.hsaShare, 8000);
  assert.equal(drained.hsaLeft, 0);
});

test("payroll toggle adds 7.65% FICA savings and does not change medical shares", () => {
  const row = evaluate(withInput({ payrollHsa: true }), 0);
  const judged = judge(row);
  assert.equal(judged.hraShare, 0);
  assert.equal(judged.hsaShare, 0);
  assert.equal(judged.hsaLeft, 8750);
  assert.equal(judged.hraTotal, 2533);
  assert.equal(judged.hsaTotal, -2487);
  assert.ok(judged.hsaTotal < -1806);
});
