#!/usr/bin/env bun
/**
 * EVAL MONTE CARLO — P(pass) and a funded year, with the zero-edge control
 * printed beside every number.
 *
 * Run 2026-08-17 at Colin's request ("just for funsies"). The caveats are not
 * decoration: SANITY_AUDIT.md's standing order is that no P(pass) is quotable
 * without the coin-flip baseline next to it, because with cheap fees and free
 * retries a WORTHLESS strategy passes 85% of 30-day campaigns. That audit
 * exists because a 92%-pass number was once quoted from an assumed edge.
 *
 * INPUTS, all real:
 *   - 411 sealed carry trades, 2015-2024 (data/proof/backtest_trades_v015_*.csv)
 *     +0.356R mean, 48.7% WR, 1.93:1 payoff, sd 1.69R, worst -3.22R, 41 trades/yr
 *   - firm terms transcribed from the rules pages (data/propfirm/firm_contracts.yaml)
 *
 * METHOD:
 *   - BLOCK bootstrap (blocks of 8) rather than IID resampling. Carry trades
 *     cluster — the same macro regime drives consecutive entries — and IID
 *     sampling destroys that clustering, which flatters drawdown badly. This is
 *     the "carry block replay" the audit used for its 49.9%/68.1% pair.
 *   - trailing/static max-DD marked on CLOSED balance, per the contract
 *   - the contract's swap haircut (0.004R/day) charged on each trade's hold
 *   - fee charged per attempt; bust = new attempt, fresh account
 *   - ZERO-EDGE CONTROL: the identical machinery on a mean-centred copy of the
 *     same distribution. Same shape, same fat tail, expectancy exactly 0.
 *
 * WHAT THIS IS NOT: a forecast. It is the sealed BACKTEST's distribution replayed
 * through real firm rules. Every known optimism in that CSV (intratrade drawdown
 * invisible, frictionless rebuy, linear R scaling) is inherited here.
 */

const CSV = `${process.env.HOME}/passing-funded-account-1-/data/proof/backtest_trades_v015_2015_2024.csv`;

type Trade = { r: number; holdDays: number };

function loadTrades(): Trade[] {
  const text = require("fs").readFileSync(CSV, "utf8").trim().split("\n");
  const head = text[0].split(",");
  const iPnl = head.indexOf("pnl_pct"), iRisk = head.indexOf("risk_pct"),
        iHold = head.indexOf("hold_days");
  return text.slice(1).map((l: string) => {
    const c = l.split(",");
    return { r: Number(c[iPnl]) / Number(c[iRisk]), holdDays: Number(c[iHold]) };
  });
}

/** Deterministic PRNG so a rerun reproduces exactly — the repo's whole culture. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Firm = {
  name: string; size: number; fee: number;
  phases: { targetPct: number }[];
  ddType: "trailing" | "static"; ddPct: number;
  dailyDd: number | null;
  swapR: number; refundOnPass: number;
  split: number;            // trader's share of funded profit
};

const FIRMS: Firm[] = [
  { name: "CTI 1-Step", size: 100_000, fee: 382, phases: [{ targetPct: 0.08 }],
    ddType: "trailing", ddPct: 0.05, dailyDd: null, swapR: 0.004,
    refundOnPass: 0, split: 0.80 },
  { name: "Alpha Swing", size: 100_000, fee: 490,
    phases: [{ targetPct: 0.10 }, { targetPct: 0.05 }],
    ddType: "static", ddPct: 0.10, dailyDd: 0.05, swapR: 0.004,
    refundOnPass: 0, split: 0.80 },
  { name: "FTMO Swing", size: 100_000, fee: 501,
    phases: [{ targetPct: 0.10 }, { targetPct: 0.05 }],
    ddType: "static", ddPct: 0.10, dailyDd: 0.05, swapR: 0.004,
    refundOnPass: 1.0, split: 0.80 },
];

const BLOCK = 8;

/** One phase. Returns how it ended and how many trades it consumed. */
function runPhase(
  pool: Trade[], rng: () => number, riskPct: number, firm: Firm,
  targetPct: number, tradeBudget: number,
): { outcome: "pass" | "bust" | "ran_out"; used: number; equityPath: number } {
  let equity = 1.0;            // fraction of starting balance
  let peak = 1.0;
  let used = 0;
  let bi = Math.floor(rng() * pool.length);
  let inBlock = 0;

  while (used < tradeBudget) {
    if (inBlock === 0) { bi = Math.floor(rng() * pool.length); inBlock = BLOCK; }
    const t = pool[bi % pool.length];
    bi++; inBlock--; used++;

    // R net of the contract's swap haircut over the hold.
    const netR = t.r - firm.swapR * t.holdDays;
    equity *= (1 + netR * riskPct);
    if (equity > peak) peak = equity;

    const floor = firm.ddType === "trailing" ? peak - firm.ddPct : 1.0 - firm.ddPct;
    if (equity <= floor) return { outcome: "bust", used, equityPath: equity };
    if (equity >= 1 + targetPct) return { outcome: "pass", used, equityPath: equity };
  }
  return { outcome: "ran_out", used, equityPath: equity };
}

type Sim = {
  passed: boolean; attempts: number; feesPaid: number;
  tradesToPass: number; fundedProfit: number; net: number;
};

function simulateYear(
  pool: Trade[], rng: () => number, riskPct: number, firm: Firm,
  tradesPerYear: number, maxAttempts: number, fundedRiskPct: number,
): Sim {
  let budget = tradesPerYear;
  let attempts = 0, fees = 0, tradesToPass = 0;

  while (attempts < maxAttempts && budget > 0) {
    attempts++; fees += firm.fee;
    let ok = true, usedTotal = 0;
    for (const ph of firm.phases) {
      const res = runPhase(pool, rng, riskPct, firm, ph.targetPct, budget - usedTotal);
      usedTotal += res.used;
      if (res.outcome !== "pass") { ok = false; break; }
    }
    budget -= usedTotal;
    tradesToPass += usedTotal;
    if (ok) {
      if (firm.refundOnPass) fees -= firm.fee * firm.refundOnPass;
      // ---- funded phase with whatever of the year remains ----
      let eq = 1.0, peak = 1.0, profit = 0;
      let bi = Math.floor(rng() * pool.length), inBlock = 0;
      for (let i = 0; i < budget; i++) {
        if (inBlock === 0) { bi = Math.floor(rng() * pool.length); inBlock = BLOCK; }
        const t = pool[bi % pool.length]; bi++; inBlock--;
        const netR = t.r - firm.swapR * t.holdDays;
        eq *= (1 + netR * fundedRiskPct);
        if (eq > peak) peak = eq;
        const floor = firm.ddType === "trailing" ? peak - firm.ddPct : 1.0 - firm.ddPct;
        if (eq <= floor) break;                    // funded account lost — payouts stop
      }
      profit = Math.max(0, (eq - 1)) * firm.size * firm.split;
      return { passed: true, attempts, feesPaid: fees, tradesToPass,
               fundedProfit: profit, net: profit - fees };
    }
  }
  return { passed: false, attempts, feesPaid: fees, tradesToPass,
           fundedProfit: 0, net: -fees };
}

// ─── run ─────────────────────────────────────────────────────────────────────

const raw = loadTrades();
const meanR = raw.reduce((s, t) => s + t.r, 0) / raw.length;
/** Zero-edge control: same shape, same fat tail, expectancy exactly zero. */
const zeroEdge: Trade[] = raw.map((t) => ({ r: t.r - meanR, holdDays: t.holdDays }));

const PATHS = 20_000;
const TRADES_PER_YEAR = 41;      // measured: 411 trades / 9.9y
const MAX_ATTEMPTS = 3;          // ARCHITECTURE.md: fee budget fixed before attempt 1
const RISKS = [0.005, 0.0075, 0.010, 0.0125, 0.015];

const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

console.log(`\n  EVAL MONTE CARLO — ${PATHS.toLocaleString()} paths/config, block bootstrap (${BLOCK})`);
console.log(`  sealed edge: ${raw.length} trades, ${meanR >= 0 ? "+" : ""}${meanR.toFixed(4)}R/trade, `
  + `${TRADES_PER_YEAR} trades/yr, worst ${Math.min(...raw.map(t => t.r)).toFixed(2)}R`);
console.log(`  max attempts/yr: ${MAX_ATTEMPTS}   funded split: 80%\n`);

for (const firm of FIRMS) {
  const floorNote = firm.ddType === "trailing"
    ? `${(firm.ddPct * 100).toFixed(0)}% trailing`
    : `${(firm.ddPct * 100).toFixed(0)}% static`;
  console.log(`  ${firm.name}  —  target ${firm.phases.map(p => (p.targetPct * 100) + "%").join(" then ")}`
    + `, ${floorNote} DD, $${firm.fee} fee`);
  console.log(`    risk    P(pass)   [zero-edge]   lift    E[net $]   p10       p50       p90`);

  for (const risk of RISKS) {
    const rngA = mulberry32(20260817);
    const real = Array.from({ length: PATHS }, () =>
      simulateYear(raw, rngA, risk, firm, TRADES_PER_YEAR, MAX_ATTEMPTS, risk));
    const rngB = mulberry32(20260817);
    const ctrl = Array.from({ length: PATHS }, () =>
      simulateYear(zeroEdge, rngB, risk, firm, TRADES_PER_YEAR, MAX_ATTEMPTS, risk));

    const pReal = real.filter((s) => s.passed).length / PATHS;
    const pCtrl = ctrl.filter((s) => s.passed).length / PATHS;
    const nets = real.map((s) => s.net);
    console.log(
      `    ${(risk * 100).toFixed(2)}%   ${(pReal * 100).toFixed(1).padStart(5)}%   `
      + `${(pCtrl * 100).toFixed(1).padStart(6)}%      `
      + `${((pReal - pCtrl) * 100).toFixed(1).padStart(5)}pp  `
      + `${("$" + Math.round(mean(nets)).toLocaleString()).padStart(9)}  `
      + `${("$" + Math.round(pct(nets, 0.10)).toLocaleString()).padStart(8)}  `
      + `${("$" + Math.round(pct(nets, 0.50)).toLocaleString()).padStart(8)}  `
      + `${("$" + Math.round(pct(nets, 0.90)).toLocaleString()).padStart(8)}`);
  }
  console.log();
}

// The single most decisive constraint, stated plainly.
const worst = Math.min(...raw.map((t) => t.r));
for (const f of FIRMS) {
  const maxRisk = f.ddPct / Math.abs(worst);
  console.log(`  ${f.name}: one ${worst.toFixed(2)}R trade alone breaches the `
    + `${(f.ddPct * 100).toFixed(0)}% floor at risk >= ${(maxRisk * 100).toFixed(2)}%`);
}
console.log();

// ─── EDGE-DECAY STRESS ───────────────────────────────────────────────────────
// CONTEXT.md: fresh 2025-26 carry performance is "approximately flat". The
// backtest's +0.356R/trade is a 2015-2024 measurement. If the edge has decayed,
// P(pass) is not what the table above says. Scaling the MEAN while preserving
// the distribution's shape and tails is the cheapest honest stress test there is.
console.log("  EDGE-DECAY STRESS — CTI 1-Step @ 1.00% risk\n");
console.log("    edge retained   mean R    P(pass)   [zero-edge 43.7%]   E[net $]");
const cti = FIRMS[0];
for (const keep of [1.0, 0.75, 0.5, 0.25, 0.0]) {
  const scaled: Trade[] = raw.map((t) => ({ r: (t.r - meanR) + meanR * keep, holdDays: t.holdDays }));
  const rng = mulberry32(20260817);
  const sims = Array.from({ length: PATHS }, () =>
    simulateYear(scaled, rng, 0.010, cti, TRADES_PER_YEAR, MAX_ATTEMPTS, 0.010));
  const p = sims.filter((s) => s.passed).length / PATHS;
  const nets = sims.map((s) => s.net);
  console.log(`    ${(keep * 100).toFixed(0).padStart(3)}%           `
    + `${(meanR * keep).toFixed(3).padStart(6)}R   ${(p * 100).toFixed(1).padStart(5)}%              `
    + `${((p - 0.437) * 100).toFixed(1).padStart(6)}pp   `
    + `${("$" + Math.round(mean(nets)).toLocaleString()).padStart(9)}`);
}
console.log();
