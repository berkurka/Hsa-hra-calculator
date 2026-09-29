/*
 * HRA vs HSA comparison for US federal tax year 2026.
 *
 * Brackets below are the top of each marginal band (inclusive). The 37% rate
 * applies above the last finite threshold.
 *
 * Federal rate schedules and standard deduction: IRS Revenue Procedure 2025-32
 * (Oct. 9, 2025), section 4.01 tables 1 and 3, and section 4.14.
 * https://www.irs.gov/pub/irs-drop/rp-25-32.pdf
 * Summarized in IRS news release IR-2025-104:
 * https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill
 *
 * Married filing jointly (Table 1): 10% to $24,800; 12% to $100,800;
 * 22% to $211,400; 24% to $403,550; 32% to $512,450; 35% to $768,700;
 * 37% above $768,700. Standard deduction $32,200.
 *
 * Single / unmarried (Table 3): 10% to $12,400; 12% to $50,400; 22% to $105,700;
 * 24% to $201,775; 32% to $256,225; 35% to $640,600; 37% above $640,600.
 * Those thresholds are exactly half of the joint thresholds through the 32%
 * bracket. The 35% bracket ends at $640,600, not at half of $768,700.
 * Standard deduction $16,100.
 *
 * HSA annual contribution limits: IRS Revenue Procedure 2025-19, section 2.01.
 * Self-only $4,400, family $8,750.
 * https://www.irs.gov/pub/irs-drop/rp-25-19.pdf
 *
 * Loaded as a classic script in the browser (window.PlanCalc) and as CommonJS
 * in the Node test. Coinsurance and stateRate on inputs are decimals (0.2 = 20%).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.PlanCalc = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TAX_2026 = {
    year: 2026,
    ficaRate: 0.0765,
    standardDeduction: {
      mfj: 32200,
      single: 16100,
    },
    hsaLimits: {
      family: 8750,
      self: 4400,
    },
    brackets: {
      mfj: [
        { upTo: 24800, rate: 0.1 },
        { upTo: 100800, rate: 0.12 },
        { upTo: 211400, rate: 0.22 },
        { upTo: 403550, rate: 0.24 },
        { upTo: 512450, rate: 0.32 },
        { upTo: 768700, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
      single: [
        { upTo: 12400, rate: 0.1 },
        { upTo: 50400, rate: 0.12 },
        { upTo: 105700, rate: 0.22 },
        { upTo: 201775, rate: 0.24 },
        { upTo: 256225, rate: 0.32 },
        { upTo: 640600, rate: 0.35 },
        { upTo: Infinity, rate: 0.37 },
      ],
    },
  };

  var DEFAULT_INPUT = {
    income: 170000,
    filingStatus: "mfj",
    deductionMode: "standard",
    itemizedDeduction: 32200,
    stateRate: 0,
    payrollHsa: false,
    hsaLimit: 8750,
    hra: {
      employerDeposit: 4000,
      deductible: 1500,
      oopMax: 7000,
      monthlyPremium: 300,
      coinsurance: 0.2,
    },
    hsa: {
      employerDeposit: 1000,
      deductible: 4000,
      oopMax: 8000,
      monthlyPremium: 96,
      coinsurance: 0.2,
      employeeContribution: 7750,
    },
  };

  var PRESET_BILLED = [0, 1500, 4000, 5000, 10000, 20000, 30000];
  var EPS = 1e-4;

  function nonneg(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return n > 0 ? n : 0;
  }

  function clamp(value, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function roundDollar(value) {
    if (!Number.isFinite(value)) return 0;
    var rounded = Math.round(value);
    return rounded === 0 ? 0 : rounded;
  }

  function federalMarginalRate(taxableIncome, filingStatus) {
    if (!(taxableIncome > 0)) return 0;
    var brackets = TAX_2026.brackets[filingStatus] || TAX_2026.brackets.mfj;
    for (var i = 0; i < brackets.length; i++) {
      if (taxableIncome <= brackets[i].upTo) return brackets[i].rate;
    }
    return brackets[brackets.length - 1].rate;
  }

  function savingsRate(marginalRate, stateRate, ficaRate) {
    return clamp(marginalRate + stateRate + ficaRate, 0, 1);
  }

  function normalizePlan(plan) {
    var source = plan || {};
    return {
      employerDeposit: nonneg(source.employerDeposit),
      deductible: nonneg(source.deductible),
      oopMax: nonneg(source.oopMax),
      monthlyPremium: nonneg(source.monthlyPremium),
      coinsurance: clamp(source.coinsurance, 0, 1),
    };
  }

  function maxEmployeeContribution(hsaLimit, employerDeposit) {
    return Math.max(0, hsaLimit - employerDeposit);
  }

  function normalize(input) {
    var source = input || {};
    var filingStatus = source.filingStatus === "single" ? "single" : "mfj";
    var deductionMode = source.deductionMode === "itemized" ? "itemized" : "standard";
    var deduction =
      deductionMode === "itemized"
        ? nonneg(source.itemizedDeduction)
        : TAX_2026.standardDeduction[filingStatus];
    var hsaLimit = nonneg(source.hsaLimit);
    var hra = normalizePlan(source.hra);
    var hsa = normalizePlan(source.hsa);
    var employeeMax = maxEmployeeContribution(hsaLimit, hsa.employerDeposit);
    var requested =
      source.hsa && source.hsa.employeeContribution != null
        ? source.hsa.employeeContribution
        : employeeMax;
    return {
      income: nonneg(source.income),
      filingStatus: filingStatus,
      deductionMode: deductionMode,
      deduction: deduction,
      stateRate: clamp(source.stateRate, 0, 1),
      payrollHsa: Boolean(source.payrollHsa),
      ficaRate: source.payrollHsa ? TAX_2026.ficaRate : 0,
      hsaLimit: hsaLimit,
      hra: hra,
      hsa: hsa,
      employeeContribution: clamp(requested, 0, employeeMax),
    };
  }

  function memberShare(billed, plan) {
    var spend = Math.max(0, billed);
    var beforeCap =
      Math.min(spend, plan.deductible) +
      plan.coinsurance * Math.max(spend - plan.deductible, 0);
    return Math.min(beforeCap, plan.oopMax);
  }

  function billedToReachOop(plan) {
    if (plan.oopMax <= 0) return 0;
    if (plan.coinsurance <= 0) return Math.min(plan.deductible, plan.oopMax);
    if (plan.oopMax <= plan.deductible) return plan.oopMax;
    return plan.deductible + (plan.oopMax - plan.deductible) / plan.coinsurance;
  }

  function hraBalanceKink(plan) {
    var deposit = plan.employerDeposit;
    if (deposit <= 0) return 0;
    if (deposit >= plan.oopMax) return null;
    if (deposit <= plan.deductible) return deposit;
    if (plan.coinsurance <= 0) return null;
    return plan.deductible + (deposit - plan.deductible) / plan.coinsurance;
  }

  function sideCosts(plan, billed, marginalInputs) {
    var annualPremium = plan.monthlyPremium * 12;
    var taxableIncome = marginalInputs.income - marginalInputs.deduction - annualPremium;
    var marginalRate = federalMarginalRate(taxableIncome, marginalInputs.filingStatus);
    var rate = savingsRate(marginalRate, marginalInputs.stateRate, marginalInputs.ficaRate);
    return {
      annualPremium: annualPremium,
      taxableIncome: taxableIncome,
      marginalRate: marginalRate,
      combinedRate: rate,
      afterTaxPremium: annualPremium * (1 - rate),
      share: memberShare(billed, plan),
    };
  }

  function evaluateModel(model, billed) {
    var spend = Math.max(0, Number(billed) || 0);
    var hra = sideCosts(model.hra, spend, model);
    var hsa = sideCosts(model.hsa, spend, model);
    var taxSavings = model.employeeContribution * hsa.combinedRate;
    hra.total = hra.afterTaxPremium + Math.max(hra.share - model.hra.employerDeposit, 0);
    hsa.employeeContribution = model.employeeContribution;
    hsa.taxSavings = taxSavings;
    hsa.total = hsa.afterTaxPremium + hsa.share - model.hsa.employerDeposit - taxSavings;
    hsa.left = Math.max(0, model.hsa.employerDeposit + model.employeeContribution - hsa.share);
    return { billed: spend, hra: hra, hsa: hsa };
  }

  function evaluate(input, billed) {
    return evaluateModel(normalize(input), billed);
  }

  function judge(row) {
    var hraTotal = roundDollar(row.hra.total);
    var hsaTotal = roundDollar(row.hsa.total);
    var gap = hsaTotal - hraTotal;
    var winner = "tie";
    var advantage = 0;
    if (gap < 0) {
      winner = "HSA";
      advantage = -gap;
    } else if (gap > 0) {
      winner = "HRA";
      advantage = gap;
    }
    return {
      hraShare: roundDollar(row.hra.share),
      hsaShare: roundDollar(row.hsa.share),
      hraTotal: hraTotal,
      hsaTotal: hsaTotal,
      hsaLeft: roundDollar(row.hsa.left),
      winner: winner,
      advantage: advantage,
    };
  }

  function kinkPoints(model) {
    var pts = [0, model.hra.deductible, model.hsa.deductible];
    pts.push(billedToReachOop(model.hra));
    pts.push(billedToReachOop(model.hsa));
    var balanceKink = hraBalanceKink(model.hra);
    if (balanceKink != null && Number.isFinite(balanceKink)) pts.push(balanceKink);
    var finite = [];
    for (var i = 0; i < pts.length; i++) {
      if (Number.isFinite(pts[i]) && pts[i] >= 0 && pts[i] <= 2000000) finite.push(pts[i]);
    }
    var last = 0;
    for (var j = 0; j < finite.length; j++) last = Math.max(last, finite[j]);
    finite.push(Math.min(2000000, last + 1));
    finite.sort(function (a, b) {
      return a - b;
    });
    var unique = [];
    for (var k = 0; k < finite.length; k++) {
      if (!unique.length || Math.abs(unique[unique.length - 1] - finite[k]) > 1e-6) {
        unique.push(finite[k]);
      }
    }
    return unique;
  }

  function findCrossovers(input) {
    var model = normalize(input);
    var points = kinkPoints(model);
    function diff(spend) {
      var row = evaluateModel(model, spend);
      return row.hsa.total - row.hra.total;
    }
    var crossings = [];
    function add(spend) {
      if (!crossings.length || Math.abs(crossings[crossings.length - 1] - spend) > 0.01) {
        crossings.push(spend);
      }
    }
    for (var i = 0; i < points.length - 1; i++) {
      var lo = points[i];
      var hi = points[i + 1];
      if (hi <= lo) continue;
      var dLo = diff(lo);
      var dHi = diff(hi);
      if (Math.abs(dLo) <= EPS && Math.abs(dHi) <= EPS) {
        add(lo);
        continue;
      }
      if (Math.abs(dLo) <= EPS) {
        add(lo);
        continue;
      }
      if (dLo * dHi < 0) {
        var left = lo;
        var right = hi;
        var fLeft = dLo;
        for (var step = 0; step < 60 && right - left > 1e-4; step++) {
          var mid = (left + right) / 2;
          var fMid = diff(mid);
          if (fLeft * fMid <= 0) right = mid;
          else {
            left = mid;
            fLeft = fMid;
          }
        }
        add((left + right) / 2);
      }
    }
    var collapsed = [];
    for (var c = 0; c < crossings.length; c++) {
      var spend = crossings[c];
      var prev = collapsed[collapsed.length - 1];
      if (prev == null) {
        collapsed.push(spend);
        continue;
      }
      var mid = (prev + spend) / 2;
      if (Math.abs(diff(prev)) <= EPS && Math.abs(diff(mid)) <= EPS && Math.abs(diff(spend)) <= EPS) {
        continue;
      }
      collapsed.push(spend);
    }
    return collapsed;
  }

  function breakpoints(input) {
    return kinkPoints(normalize(input));
  }

  return {
    TAX_2026: TAX_2026,
    DEFAULT_INPUT: DEFAULT_INPUT,
    PRESET_BILLED: PRESET_BILLED,
    federalMarginalRate: federalMarginalRate,
    maxEmployeeContribution: maxEmployeeContribution,
    normalize: normalize,
    memberShare: memberShare,
    evaluate: evaluate,
    judge: judge,
    findCrossovers: findCrossovers,
    breakpoints: breakpoints,
    roundDollar: roundDollar,
  };
});
