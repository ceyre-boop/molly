#!/usr/bin/env bun
/**
 * THETA HARVEST — pull the options archive before the subscription lapses.
 *
 * Written 2026-08-15, the night Colin cancelled ThetaData. The entitlement is
 * still live (OPTION.VALUE, verified by terminal login) and serves 2020-01-02
 * through yesterday. Once billing actually ends, this history is unrecoverable
 * at any price short of re-subscribing, so the job is: get the widest, deepest
 * slice onto local disk while the key still answers.
 *
 * SHAPE OF THE PULL, measured rather than assumed:
 *   /v2/bulk_hist/option/eod?root=X&exp=0&start_date=D&end_date=D
 *   returns the ENTIRE chain for one root on one date — every expiration, every
 *   strike, with OHLC + bid/ask + sizes. SPY on 2024-01-02: 7,950 contracts,
 *   1.86 MB, 1.9 seconds. That is one call per (root, date), which is what makes
 *   six years tractable instead of a cross-product nightmare.
 *
 *   `exp=0` initially looked unsupported (HTTP 472). It was a bad DATE — a
 *   Saturday. The parameter is fine. Worth recording because the 472 body says
 *   "No data for the specified timeframe and chain", which reads like a schema
 *   complaint and is actually a calendar one.
 *
 * STATUS CODES ARE NOT CONFLATED — the same discipline as everything else here:
 *   200  data, written
 *   472  no data for that date (weekend/holiday) — expected, recorded, not an error
 *   471  outside the entitlement window — the signal that billing has lapsed or
 *        the date predates coverage. Counted separately, because a RUN of these
 *        starting mid-harvest means the subscription just died and the operator
 *        needs to know immediately, not at the end.
 *   else loud, retried with backoff, then recorded as failed
 *
 * RESUMABLE BY CONSTRUCTION. One gzipped file per (root, date); an existing file
 * is skipped. Kill it and restart it as often as you like — it picks up exactly
 * where it stopped. There is no state file to corrupt, because the data on disk
 * IS the state.
 *
 * TIERED, so the most valuable data lands first. If access dies at 3am, tier 1
 * is already down.
 *
 *   bun theta-harvest.ts                 # all tiers, 2020-01-02 -> yesterday
 *   bun theta-harvest.ts --tier 1        # index ETFs only
 *   bun theta-harvest.ts --from 20240101 # narrower window
 *   bun theta-harvest.ts --dry-run       # show the plan, pull nothing
 */

const HOME = process.env.HOME!;
const OUT_ROOT = `${HOME}/thetadata-archive`;
const BASE = "http://127.0.0.1:25510";

/** Deliberately NOT inside a git repo. This is gigabytes of data; committing it
 *  or even leaving it staged would be its own kind of accident. */

const TIERS: Record<number, { roots: string[]; why: string }> = {
  1: {
    roots: ["SPY", "QQQ", "IWM"],
    why: "index ETFs — the VRP work's core chains, most liquid, most reusable",
  },
  2: {
    roots: ["FXE", "FXB", "FXY", "FXA"],
    why: "currency ETFs — FXE is the chain that unblocked VRP Stage 2/3 (CONTEXT.md 2026-07-02)",
  },
  3: {
    roots: ["NVDA"],
    why: "the daytrade cockpit's symbol — options context for the equity it trades",
  },
  4: {
    roots: ["TLT", "GLD", "USO", "XLF", "SMH", "AAPL", "MSFT", "TSLA", "AMD"],
    why: "liquid majors — breadth for cross-sectional work later",
  },
};

const DEFAULT_FROM = "20200102";   // earliest date the entitlement serves (probed)

// ─── args ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const dryRun = argv.includes("--dry-run");
const onlyTier = arg("--tier");
const from = arg("--from", DEFAULT_FROM)!;
const to = arg("--to", yesterday())!;
const CONCURRENCY = Number(arg("--concurrency", "3"));

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Trading days only. Skipping weekends locally saves ~28% of all calls — the
 *  server would answer 472 for every one of them. Holidays still cost a call;
 *  hardcoding a holiday calendar is a maintenance liability for a 28% -> 31%
 *  improvement, so they are left to the 472 path. */
function tradingDays(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T12:00:00Z`);
  const last = new Date(`${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}T12:00:00Z`);
  while (d <= last) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ─── the fetch ───────────────────────────────────────────────────────────────

type Outcome = "written" | "skipped" | "nodata" | "unentitled" | "failed";

async function pull(root: string, date: string): Promise<Outcome> {
  const dir = `${OUT_ROOT}/${root}`;
  const path = `${dir}/${root}_${date}.json.gz`;
  if (await Bun.file(path).exists()) return "skipped";

  const url = `${BASE}/v2/bulk_hist/option/eod?root=${root}&exp=0&start_date=${date}&end_date=${date}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 120_000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(timer);

      if (r.status === 472) return "nodata";        // weekend / holiday — expected
      if (r.status === 471) return "unentitled";    // outside coverage, or billing ended
      if (r.status !== 200) {
        if (attempt === 3) {
          console.error(`  !! ${root} ${date}: HTTP ${r.status} after 3 attempts`);
          return "failed";
        }
        await Bun.sleep(2000 * attempt);
        continue;
      }

      const body = await r.arrayBuffer();
      if (body.byteLength === 0) return "nodata";
      require("fs").mkdirSync(dir, { recursive: true });
      // Gzip: these are highly repetitive numeric JSON; ~4-5x on measured samples.
      await Bun.write(path, Bun.gzipSync(new Uint8Array(body)));
      return "written";
    } catch (e: any) {
      clearTimeout(timer);
      if (attempt === 3) {
        console.error(`  !! ${root} ${date}: ${e?.name === "AbortError" ? "timeout 120s" : e?.message}`);
        return "failed";
      }
      // The terminal wedges under parallel load; backing off is what un-wedges it.
      await Bun.sleep(3000 * attempt);
    }
  }
  return "failed";
}

// ─── run ─────────────────────────────────────────────────────────────────────

const tiers = onlyTier ? [Number(onlyTier)] : Object.keys(TIERS).map(Number).sort();
const days = tradingDays(from, to);

console.log(`\n  THETA HARVEST`);
console.log(`  window      ${from} -> ${to}  (${days.length} trading days)`);
console.log(`  output      ${OUT_ROOT.replace(HOME, "~")}`);
console.log(`  concurrency ${CONCURRENCY}`);
for (const t of tiers) {
  console.log(`  tier ${t}      ${TIERS[t].roots.join(" ")}`);
  console.log(`              \x1b[2m${TIERS[t].why}\x1b[0m`);
}
const totalCalls = tiers.reduce((n, t) => n + TIERS[t].roots.length * days.length, 0);
console.log(`\n  ${totalCalls.toLocaleString()} (root,date) pairs — roughly `
  + `${(totalCalls * 2 / CONCURRENCY / 3600).toFixed(1)}h at measured 2s/call\n`);

if (dryRun) { console.log("  --dry-run: nothing pulled\n"); process.exit(0); }

const tally: Record<Outcome, number> = {
  written: 0, skipped: 0, nodata: 0, unentitled: 0, failed: 0,
};
let done = 0;
let consecutiveUnentitled = 0;
const started = Date.now();

for (const t of tiers) {
  for (const root of TIERS[t].roots) {
    // Chunked concurrency: the terminal is a single local process and wedged
    // outright under a heavy parallel burst during probing.
    for (let i = 0; i < days.length; i += CONCURRENCY) {
      const batch = days.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.all(batch.map((d) => pull(root, d)));
      for (const o of outcomes) {
        tally[o]++;
        done++;
        if (o === "unentitled") consecutiveUnentitled++;
        else if (o === "written" || o === "nodata") consecutiveUnentitled = 0;
      }

      // THE ONE ALARM WORTH INTERRUPTING FOR. Scattered 471s are old dates
      // outside coverage. A long unbroken RUN of them means the subscription
      // stopped answering mid-harvest, and every remaining call is wasted.
      if (consecutiveUnentitled >= 40) {
        console.error(`\n  !! ${consecutiveUnentitled} consecutive UNENTITLED responses.`);
        console.error(`  !! The entitlement has almost certainly lapsed. Stopping rather than`);
        console.error(`  !! burning hours on calls that cannot return data.`);
        console.error(`  !! Harvested so far: ${tally.written.toLocaleString()} files.\n`);
        process.exit(3);
      }

      if (done % 60 === 0) {
        const el = (Date.now() - started) / 1000;
        const rate = done / el;
        const eta = ((totalCalls - done) / rate / 60).toFixed(0);
        process.stdout.write(
          `\r  ${root}  ${done.toLocaleString()}/${totalCalls.toLocaleString()}  `
          + `written ${tally.written.toLocaleString()}  skip ${tally.skipped.toLocaleString()}  `
          + `nodata ${tally.nodata}  fail ${tally.failed}  ~${eta}m left    `);
      }
    }
  }
}

const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n\n  done in ${mins}m`);
console.log(`    written     ${tally.written.toLocaleString()}`);
console.log(`    skipped     ${tally.skipped.toLocaleString()}  (already on disk)`);
console.log(`    no data     ${tally.nodata.toLocaleString()}  (holidays)`);
console.log(`    unentitled  ${tally.unentitled.toLocaleString()}`);
console.log(`    failed      ${tally.failed.toLocaleString()}`);
console.log(`\n  ${OUT_ROOT.replace(HOME, "~")}\n`);
process.exit(tally.failed > 0 ? 1 : 0);
