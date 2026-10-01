(function () {
  "use strict";

  var HRA_COLOR = "#1f6b5a";
  var HSA_COLOR = "#b5481d";
  var SVG_NS = "http://www.w3.org/2000/svg";

  var contributionAuto = true;
  var itemizedAuto = true;
  var customRows = [];
  var customSeq = 1;
  var chartModel = null;

  function $(id) {
    return document.getElementById(id);
  }

  function num(id) {
    var value = parseFloat($(id).value);
    return Number.isFinite(value) ? value : 0;
  }

  function percent(id) {
    return Math.min(100, Math.max(0, num(id))) / 100;
  }

  function filingStatus() {
    return $("filing").value === "single" ? "single" : "mfj";
  }

  function deductionMode() {
    var selected = document.querySelector('input[name="deduction"]:checked');
    return selected && selected.value === "itemized" ? "itemized" : "standard";
  }

  function coverage() {
    var selected = document.querySelector('input[name="coverage"]:checked');
    return selected && selected.value === "self" ? "self" : "family";
  }

  function standardDeductionAmount() {
    return PlanCalc.TAX_2026.standardDeduction[filingStatus()];
  }

  function readInput() {
    return {
      income: num("income"),
      filingStatus: filingStatus(),
      deductionMode: deductionMode(),
      itemizedDeduction: num("itemized"),
      stateRate: percent("state-rate"),
      payrollHsa: $("payroll").checked,
      hsaLimit: num("hsa-limit"),
      hra: {
        employerDeposit: num("hra-deposit"),
        deductible: num("hra-deductible"),
        oopMax: num("hra-oop"),
        monthlyPremium: num("hra-premium"),
        coinsurance: percent("hra-coinsurance"),
      },
      hsa: {
        employerDeposit: num("hsa-deposit"),
        deductible: num("hsa-deductible"),
        oopMax: num("hsa-oop"),
        monthlyPremium: num("hsa-premium"),
        coinsurance: percent("hsa-coinsurance"),
        employeeContribution: num("hsa-employee"),
      },
    };
  }

  function formatMoney(value) {
    var rounded = PlanCalc.roundDollar(value);
    var abs = Math.abs(rounded).toLocaleString("en-US");
    return (rounded < 0 ? "-" : "") + "$" + abs;
  }

  function formatCents(value) {
    if (!Number.isFinite(value)) return "$0.00";
    var sign = value < 0 ? "-" : "";
    return sign + "$" + Math.abs(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPercent(rate) {
    return (rate * 100).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    }) + "%";
  }

  function planName(winner) {
    if (winner === "HSA") return "HSA plan";
    if (winner === "HRA") return "HRA plan";
    return "neither plan";
  }

  function syncContribution() {
    var max = PlanCalc.maxEmployeeContribution(num("hsa-limit"), num("hsa-deposit"));
    var field = $("hsa-employee");
    field.max = String(max);
    if (contributionAuto) field.value = String(max);
    else if (num("hsa-employee") > max) field.value = String(max);
  }

  function applyCoverageLimit() {
    var limits = PlanCalc.TAX_2026.hsaLimits;
    $("hsa-limit").value = String(coverage() === "self" ? limits.self : limits.family);
  }

  function updateHints() {
    var limits = PlanCalc.TAX_2026.hsaLimits;
    var preset = coverage() === "self" ? limits.self : limits.family;
    var coverageName = coverage() === "self" ? "self-only" : "family";
    $("limit-hint").textContent =
      "2026 IRS limit for " + coverageName + " coverage is " + formatMoney(preset) +
      ". The number in this field is what the calculator uses.";
    var max = PlanCalc.maxEmployeeContribution(num("hsa-limit"), num("hsa-deposit"));
    $("contribution-hint").textContent =
      "Capped at " + formatMoney(max) + " (limit minus the employer deposit).";
    $("standard-label").textContent = "Standard (" + formatMoney(standardDeductionAmount()) + ")";
    $("itemized-wrap").hidden = deductionMode() !== "itemized";
  }

  function stat(term, description) {
    var wrap = document.createElement("div");
    var dt = document.createElement("dt");
    var dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = description;
    wrap.appendChild(dt);
    wrap.appendChild(dd);
    return wrap;
  }

  function updateSummary(input, crossings) {
    var sample = PlanCalc.evaluate(input, 0);
    var figure = $("crossover-figure");
    var copy = $("crossover-copy");
    if (!crossings.length) {
      var atZero = PlanCalc.judge(sample);
      figure.textContent = "No crossover";
      if (atZero.winner === "tie") {
        copy.textContent = "These inputs keep both plans at the same total cost across the range shown.";
      } else {
        copy.textContent =
          "The " + planName(atZero.winner) +
          " costs less at every billed amount through the out-of-pocket caps.";
      }
    } else {
      var first = crossings[0];
      figure.textContent = "About " + formatMoney(first);
      var parts = ["The plans cost the same at about " + formatMoney(first) + " of billed charges."];
      if (first > 1) {
        var below = PlanCalc.judge(PlanCalc.evaluate(input, Math.max(0, first - 50)));
        if (below.winner !== "tie") {
          parts.push("Below that, the " + planName(below.winner) + " costs less.");
        }
      }
      var above = PlanCalc.judge(PlanCalc.evaluate(input, first + 50));
      if (above.winner !== "tie") {
        parts.push("Above that, the " + planName(above.winner) + " costs less.");
      }
      if (crossings.length > 1) {
        parts.push(
          "They meet again near " +
            crossings.slice(1).map(formatMoney).join(" and ") +
            "."
        );
      }
      copy.textContent = parts.join(" ");
    }

    var sameRate = sample.hra.marginalRate === sample.hsa.marginalRate;
    var stats = $("stats");
    stats.replaceChildren();
    stats.appendChild(stat(
      "Federal marginal rate",
      sameRate
        ? formatPercent(sample.hra.marginalRate) + " on both plans"
        : "HRA " + formatPercent(sample.hra.marginalRate) + " · HSA " + formatPercent(sample.hsa.marginalRate)
    ));
    stats.appendChild(stat(
      "Taxable income",
      "HRA " + formatMoney(sample.hra.taxableIncome) + " · HSA " + formatMoney(sample.hsa.taxableIncome)
    ));
    stats.appendChild(stat("After-tax HRA premium", formatCents(sample.hra.afterTaxPremium)));
    stats.appendChild(stat(
      "After-tax HSA premium",
      formatCents(sample.hsa.afterTaxPremium) + " · tax savings " + formatCents(sample.hsa.taxSavings)
    ));
  }

  function winnerLabel(judged) {
    if (judged.winner === "tie") return "Tie";
    return judged.winner + " by " + formatMoney(judged.advantage);
  }

  function appendCell(row, text, className) {
    var cell = document.createElement("td");
    cell.textContent = text;
    if (className) cell.className = className;
    row.appendChild(cell);
    return cell;
  }

  function updateTable(input, crossings) {
    var body = $("scenario-body");
    var rows = PlanCalc.PRESET_BILLED.map(function (amount) {
      return { amount: amount, kind: "preset" };
    });
    crossings.forEach(function (amount) {
      rows.push({ amount: amount, kind: "crossover" });
    });
    customRows.forEach(function (row) {
      rows.push({ amount: row.amount, kind: "custom", id: row.id });
    });
    rows.sort(function (a, b) {
      return a.amount - b.amount;
    });

    body.replaceChildren();
    rows.forEach(function (row) {
      var evaluated = PlanCalc.evaluate(input, row.amount);
      var judged = PlanCalc.judge(evaluated);
      var tr = document.createElement("tr");
      if (row.kind === "crossover") tr.className = "crossover";

      var billed = document.createElement("th");
      billed.scope = "row";
      var label = document.createElement("div");
      label.className = "billed-label";
      var amount = document.createElement("span");
      if (row.kind === "crossover") {
        amount.textContent = "≈ " + formatMoney(row.amount);
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "Crossover";
        label.appendChild(amount);
        label.appendChild(tag);
      } else {
        amount.textContent = formatMoney(row.amount);
        label.appendChild(amount);
        if (row.kind === "custom") {
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "linkish";
          remove.textContent = "Remove";
          remove.setAttribute("aria-label", "Remove billed amount " + formatMoney(row.amount));
          remove.addEventListener("click", function () {
            customRows = customRows.filter(function (item) {
              return item.id !== row.id;
            });
            render();
          });
          label.appendChild(remove);
        }
      }
      billed.appendChild(label);
      tr.appendChild(billed);

      appendCell(tr, formatMoney(judged.hraShare));
      appendCell(tr, formatMoney(judged.hsaShare));
      appendCell(tr, formatMoney(judged.hraTotal));
      appendCell(tr, formatMoney(judged.hsaTotal), judged.hsaTotal < 0 ? "ahead" : "");
      var better = appendCell(tr, "");
      var pill = document.createElement("span");
      pill.className = "pill " + judged.winner.toLowerCase();
      pill.textContent = winnerLabel(judged);
      better.appendChild(pill);
      appendCell(tr, formatMoney(judged.hsaLeft));
      body.appendChild(tr);
    });
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach(function (key) {
      el.setAttribute(key, attrs[key]);
    });
    return el;
  }

  function niceCeiling(value) {
    if (value <= 35000) return 35000;
    var pow = Math.pow(10, Math.floor(Math.log10(value)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) {
      var candidate = steps[i] * pow;
      if (candidate >= value) return candidate;
    }
    return 10 * pow;
  }

  function axisLabel(value) {
    var sign = value < 0 ? "−" : "";
    var abs = Math.abs(value);
    if (abs >= 1000) {
      var thousands = abs / 1000;
      var text = Math.abs(thousands - Math.round(thousands)) < 0.05
        ? String(Math.round(thousands))
        : thousands.toFixed(1);
      return sign + "$" + text + "k";
    }
    return sign + "$" + Math.round(abs);
  }

  function niceTicks(min, max, count) {
    var span = max - min || 1;
    var rough = span / count;
    var mag = Math.pow(10, Math.floor(Math.log10(rough)));
    var residual = rough / mag;
    var step = residual >= 7.5 ? 10 * mag : residual >= 3.5 ? 5 * mag : residual >= 1.5 ? 2 * mag : mag;
    var ticks = [];
    var start = Math.ceil(min / step) * step;
    for (var value = start; value <= max + step * 0.01; value += step) ticks.push(value);
    return ticks;
  }

  function updateChart(input, crossings) {
    var host = $("chart");
    var extras = [30000];
    crossings.forEach(function (amount) { extras.push(amount); });
    customRows.forEach(function (row) { extras.push(row.amount); });
    PlanCalc.breakpoints(input).forEach(function (amount) { extras.push(amount); });
    var xMax = niceCeiling(Math.max.apply(null, extras));
    var amounts = [];
    var steps = 120;
    for (var i = 0; i <= steps; i++) amounts.push((xMax * i) / steps);
    amounts = amounts.concat(extras.filter(function (amount) {
      return amount >= 0 && amount <= xMax;
    }));
    amounts.sort(function (a, b) { return a - b; });
    var points = [];
    var last = -1;
    amounts.forEach(function (amount) {
      if (Math.abs(amount - last) < 1e-6) return;
      last = amount;
      var row = PlanCalc.evaluate(input, amount);
      points.push({ s: amount, hra: row.hra.total, hsa: row.hsa.total });
    });

    var yValues = [0];
    points.forEach(function (point) {
      yValues.push(point.hra, point.hsa);
    });
    var yMin = Math.min.apply(null, yValues);
    var yMax = Math.max.apply(null, yValues);
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    var pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;

    var width = 720;
    var height = 340;
    var margin = { left: 58, right: 16, top: 12, bottom: 36 };
    var plotW = width - margin.left - margin.right;
    var plotH = height - margin.top - margin.bottom;

    function xPos(spend) {
      return margin.left + (spend / xMax) * plotW;
    }
    function yPos(cost) {
      return margin.top + (1 - (cost - yMin) / (yMax - yMin)) * plotH;
    }
    function linePoints(key) {
      return points.map(function (point) {
        return xPos(point.s).toFixed(2) + "," + yPos(point[key]).toFixed(2);
      }).join(" ");
    }

    var svg = svgEl("svg", {
      viewBox: "0 0 " + width + " " + height,
      role: "img",
      "aria-label": "Line chart of HRA and HSA total cost versus billed charges. The same numbers are in the table.",
    });

    niceTicks(yMin, yMax, 5).forEach(function (tick) {
      var y = yPos(tick);
      svg.appendChild(svgEl("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: y,
        y2: y,
        stroke: Math.abs(tick) < 1e-6 ? "#cfc4b2" : "#eee6da",
        "stroke-width": Math.abs(tick) < 1e-6 ? 1.4 : 1,
      }));
      var label = svgEl("text", {
        x: margin.left - 8,
        y: y + 4,
        "text-anchor": "end",
        fill: "#5e584e",
        "font-size": "12",
      });
      label.textContent = axisLabel(tick);
      svg.appendChild(label);
    });

    var xStep = xMax <= 35000 ? 5000 : xMax / 5;
    for (var xTick = 0; xTick <= xMax + xStep * 0.01; xTick += xStep) {
      var label = svgEl("text", {
        x: xPos(xTick),
        y: height - 12,
        "text-anchor": "middle",
        fill: "#5e584e",
        "font-size": "12",
      });
      label.textContent = axisLabel(xTick);
      svg.appendChild(label);
    }

    crossings.forEach(function (spend) {
      if (spend < 0 || spend > xMax) return;
      svg.appendChild(svgEl("line", {
        x1: xPos(spend),
        x2: xPos(spend),
        y1: margin.top,
        y2: margin.top + plotH,
        stroke: "#c4a15a",
        "stroke-dasharray": "4 4",
      }));
    });

    svg.appendChild(svgEl("polyline", {
      points: linePoints("hra"),
      fill: "none",
      stroke: HRA_COLOR,
      "stroke-width": "2.5",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    }));
    svg.appendChild(svgEl("polyline", {
      points: linePoints("hsa"),
      fill: "none",
      stroke: HSA_COLOR,
      "stroke-width": "2.5",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    }));

    var hover = svgEl("line", {
      x1: 0, x2: 0, y1: margin.top, y2: margin.top + plotH,
      stroke: "#1c2421",
      "stroke-width": "1",
      visibility: "hidden",
    });
    svg.appendChild(hover);
    svg.appendChild(svgEl("rect", {
      x: margin.left,
      y: margin.top,
      width: plotW,
      height: plotH,
      fill: "transparent",
    }));

    host.replaceChildren(svg);
    chartModel = {
      points: points,
      xPos: xPos,
      yPos: yPos,
      margin: margin,
      plotW: plotW,
      width: width,
      hover: hover,
    };

    svg.addEventListener("pointermove", function (event) {
      var bounds = svg.getBoundingClientRect();
      var localX = ((event.clientX - bounds.left) / bounds.width) * width;
      var spend = ((localX - margin.left) / plotW) * xMax;
      showChartReadout(Math.max(0, Math.min(xMax, spend)));
    });
    svg.addEventListener("pointerleave", function () {
      hover.setAttribute("visibility", "hidden");
      $("chart-readout").textContent = "Hover the chart to read a billed amount.";
    });
  }

  function showChartReadout(spend) {
    if (!chartModel) return;
    var nearest = chartModel.points[0];
    var best = Infinity;
    chartModel.points.forEach(function (point) {
      var distance = Math.abs(point.s - spend);
      if (distance < best) {
        best = distance;
        nearest = point;
      }
    });
    var x = chartModel.xPos(nearest.s);
    chartModel.hover.setAttribute("x1", x);
    chartModel.hover.setAttribute("x2", x);
    chartModel.hover.setAttribute("visibility", "visible");
    $("chart-readout").textContent =
      "Billed " + formatMoney(nearest.s) +
      " · HRA " + formatMoney(nearest.hra) +
      " · HSA " + formatMoney(nearest.hsa);
  }

  function render() {
    var input = readInput();
    updateHints();
    var crossings = PlanCalc.findCrossovers(input);
    updateSummary(input, crossings);
    updateTable(input, crossings);
    updateChart(input, crossings);
  }

  function addCustom() {
    var raw = parseFloat($("custom-billed").value);
    var message = $("add-message");
    if (!Number.isFinite(raw) || raw < 0) {
      message.textContent = "Enter a billed amount of zero or more.";
      return;
    }
    var key = PlanCalc.roundDollar(raw);
    var presetHit = PlanCalc.PRESET_BILLED.some(function (amount) {
      return PlanCalc.roundDollar(amount) === key;
    });
    var customHit = customRows.some(function (row) {
      return PlanCalc.roundDollar(row.amount) === key;
    });
    var crossHit = PlanCalc.findCrossovers(readInput()).some(function (amount) {
      return PlanCalc.roundDollar(amount) === key;
    });
    if (presetHit || customHit || crossHit) {
      message.textContent = "That amount is already in the table.";
      return;
    }
    customRows.push({ id: customSeq++, amount: raw });
    $("custom-billed").value = "";
    message.textContent = "Added " + formatMoney(raw) + ".";
    render();
  }

  function resetForm() {
    var defaults = PlanCalc.DEFAULT_INPUT;
    contributionAuto = true;
    itemizedAuto = true;
    customRows = [];
    $("income").value = String(defaults.income);
    $("filing").value = defaults.filingStatus;
    document.querySelector('input[name="deduction"][value="standard"]').checked = true;
    document.querySelector('input[name="coverage"][value="family"]').checked = true;
    $("itemized").value = String(defaults.itemizedDeduction);
    $("hsa-limit").value = String(defaults.hsaLimit);
    $("state-rate").value = "0";
    $("payroll").checked = false;
    $("hra-deposit").value = String(defaults.hra.employerDeposit);
    $("hra-deductible").value = String(defaults.hra.deductible);
    $("hra-oop").value = String(defaults.hra.oopMax);
    $("hra-premium").value = String(defaults.hra.monthlyPremium);
    $("hra-coinsurance").value = String(defaults.hra.coinsurance * 100);
    $("hsa-deposit").value = String(defaults.hsa.employerDeposit);
    $("hsa-deductible").value = String(defaults.hsa.deductible);
    $("hsa-oop").value = String(defaults.hsa.oopMax);
    $("hsa-premium").value = String(defaults.hsa.monthlyPremium);
    $("hsa-coinsurance").value = String(defaults.hsa.coinsurance * 100);
    $("hsa-employee").value = String(defaults.hsa.employeeContribution);
    $("custom-billed").value = "";
    $("add-message").textContent = "";
    render();
  }

  function onFormInput(event) {
    var target = event.target;
    if (target.name === "coverage") applyCoverageLimit();
    if (target.id === "filing" && itemizedAuto) {
      $("itemized").value = String(standardDeductionAmount());
    }
    if (target.id === "itemized") itemizedAuto = false;
    if (target.id === "hsa-employee" && target.value.trim() !== "") contributionAuto = false;
    if (
      target.name === "coverage" ||
      target.id === "hsa-limit" ||
      target.id === "hsa-deposit" ||
      target.id === "hsa-employee"
    ) {
      syncContribution();
    }
    render();
  }

  document.getElementById("inputs").addEventListener("submit", function (event) {
    event.preventDefault();
  });
  document.getElementById("inputs").addEventListener("input", onFormInput);
  $("reset").addEventListener("click", resetForm);
  $("add-billed").addEventListener("click", addCustom);
  $("custom-billed").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      addCustom();
    }
  });
  document.querySelectorAll('input[type="number"]').forEach(function (field) {
    field.addEventListener("wheel", function () {
      field.blur();
    }, { passive: true });
  });

  render();
})();
