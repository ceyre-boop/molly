#!/usr/bin/env bun
/**
 * PREFLIGHT — is every data connection Colin owns actually alive, right now?
 *
 * Born 2026-08-13 when an .env was overwritten; rewritten 2026-08-15 when the
 * real problem became clear. The wipe was never the issue. The issue is that
 * ~57 credentials live across 9 .env files, 10 of them duplicated between
 * projects, and NOTHING checks whether any of them still work. Two were found
 * dead weeks after they died. ThetaData rotated silently in July and cost a
 * session. Same failure, three times.
 *
 * WHAT THIS IS: one command that probes every credential it recognises, in
 * every .env on the machine, and says which are alive — in about a second.
 *
 * THREE STATES, NEVER CONFLATED, because they need different fixes:
 *   MISSING    not in the .env            -> copy it in
 *   DEAD       present, provider says no  -> dashboard visit, regenerate
 *   OK         provider answered
 * Plus WARN for safety invariants that are not about connectivity at all
 * (a live-trading flag set on a practice account is not a "connection" problem,
 * but it is the one you most want shouted at you).
 *
 * DRIFT is reported separately and is the finding this tool exists for: when the
 * same credential appears in two projects with DIFFERENT values, one of them is
 * stale and you will not find out until something fails at 09:31. It compares
 * SHA-256 prefixes, never values.
 *
 * SECRETS ARE NEVER PRINTED — masked to first-4/last-2 everywhere, including
 * error paths. Safe to run on a shared screen, safe to pipe into a log.
 *
 * COSTS NOTHING TO RUN. Every probe is a free metadata/auth endpoint. A
 * preflight that bills per run is a preflight you switch off.
 *
 *   preflight                 # everything, grouped by provider
 *   preflight --by-project    # grouped by .env file instead
 *   preflight --drift         # only the duplicated-and-diverged report
 *   preflight --json          # for Pulse
 *   preflight --quiet         # exit code only
 */

import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";

const HOME = process.env.HOME!;
const TIMEOUT_MS = 10_000;

// ─── where credentials live ──────────────────────────────────────────────────

const ENV_FILES: { path: string; project: string; note?: string }[] = [
  { path: `${HOME}/passing-funded-account-1-/.env`, project: "funded-account" },
  { path: `${HOME}/quant/.env`, project: "quant" },
  { path: `${HOME}/quant-mind/.env`, project: "quant-mind" },
  { path: `${HOME}/TABOOST_Platfrom/.env`, project: "taboost-platform" },
  { path: `${HOME}/email-automation/.env`, project: "email-automation" },
  { path: `${HOME}/molly/.env`, project: "molly" },
  { path: `${HOME}/.claude/.env`, project: "pai" },
  { path: `${HOME}/colin-s-college-pathway/.env`, project: "college-pathway" },
  { path: `${HOME}/ThetaTerminal/.env`, project: "thetaterminal" },
  { path: `${HOME}/Downloads/.env`, project: "DOWNLOADS", note: "credentials sitting in Downloads — move or delete" },
];

// ─── how to test each provider ───────────────────────────────────────────────

type Probe = (env: Record<string, string>) => Promise<Response>;
type Provider = {
  /** env var that triggers this probe */
  trigger: string;
  label: string;
  /** true = something real breaks when this is dead */
  critical: boolean;
  probe: Probe;
  /** non-network invariant; returns a problem string or null */
  assert?: (env: Record<string, string>) => string | null;
};

const get = (url: string, headers: Record<string, string> = {}) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  return fetch(url, { headers, signal: ctl.signal }).finally(() => clearTimeout(t));
};

const PROVIDERS: Provider[] = [
  {
    trigger: "ANTHROPIC_API_KEY", label: "Anthropic", critical: true,
    probe: (e) => get("https://api.anthropic.com/v1/models", {
      "x-api-key": e.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }),
  },
  {
    trigger: "OPENAI_API_KEY", label: "OpenAI", critical: true,
    probe: (e) => get("https://api.openai.com/v1/models", {
      Authorization: `Bearer ${e.OPENAI_API_KEY}` }),
  },
  {
    trigger: "ALPACA_API_KEY", label: "Alpaca (paper)", critical: true,
    probe: (e) => get("https://paper-api.alpaca.markets/v2/account", {
      "APCA-API-KEY-ID": e.ALPACA_API_KEY,
      "APCA-API-SECRET-KEY": e.ALPACA_SECRET_KEY ?? "" }),
    assert: (e) => !e.ALPACA_SECRET_KEY
      ? "ALPACA_SECRET_KEY absent — the key id alone cannot authenticate"
      : !e.ALPACA_API_KEY.startsWith("PK")
      ? "key does not start with PK — expected a PAPER key"
      : null,
  },
  {
    trigger: "OANDA_API_KEY", label: "OANDA", critical: true,
    probe: (e) => get(`${e.OANDA_BASE_URL ?? "https://api-fxpractice.oanda.com"}/v3/accounts`,
      { Authorization: `Bearer ${e.OANDA_API_KEY}` }),
    assert: (e) => {
      const live = (e.OANDA_LIVE ?? "0").trim();
      const url = e.OANDA_BASE_URL ?? "";
      if (live !== "0" || url.includes("api-fxtrade"))
        return `LIVE TRADING FLAGS — OANDA_LIVE=${live}, base=${url || "(unset)"}`;
      return null;
    },
  },
  {
    trigger: "POLYGON_API_KEY", label: "Polygon", critical: false,
    probe: (e) => get(`https://api.polygon.io/v3/reference/tickers?limit=1&apiKey=${e.POLYGON_API_KEY}`),
  },
  {
    trigger: "FRED_API_KEY", label: "FRED", critical: false,
    probe: (e) => get(`https://api.stlouisfed.org/fred/series?series_id=GDP&api_key=${e.FRED_API_KEY}&file_type=json`),
  },
  {
    trigger: "NEWS_API_KEY", label: "NewsAPI", critical: false,
    probe: (e) => get(`https://newsapi.org/v2/top-headlines?country=us&pageSize=1&apiKey=${e.NEWS_API_KEY}`),
  },
  {
    trigger: "TIINGO_API_KEY", label: "Tiingo", critical: false,
    probe: (e) => get("https://api.tiingo.com/api/test", {
      Authorization: `Token ${e.TIINGO_API_KEY}` }),
  },
  {
    trigger: "ALPHA_VANTAGE_API_KEY", label: "AlphaVantage", critical: false,
    // AV returns 200 with an error BODY on a bad key, so status alone lies.
    probe: async (e) => {
      const r = await get(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=${e.ALPHA_VANTAGE_API_KEY}`);
      const body = await r.clone().text();
      if (/Invalid API call|invalid api key/i.test(body))
        return new Response(null, { status: 401 });
      return r;
    },
  },
  {
    trigger: "NASDAQ_DATA_LINK_API_KEY", label: "Nasdaq Data Link", critical: false,
    // UNTESTABLE FROM HERE, and saying so is the honest output.
    // data.nasdaq.com sits behind a bot-protection edge that returns a 403 HTML
    // page to every non-browser request. Verified 2026-08-15 with a control: a
    // deliberately fake key returns the byte-identical 403, so the response
    // carries no information about the key at all. Reporting that as DEAD is a
    // false red, and a check that cries wolf is worse than no check — you learn
    // to skim past reds, and then you skim past a real one.
    probe: async () => new Response(null, { status: 599 }),
  },
  {
    trigger: "DATABENTO_API_KEY", label: "Databento", critical: false,
    probe: (e) => get("https://hist.databento.com/v0/metadata.list_datasets", {
      Authorization: `Basic ${Buffer.from(`${e.DATABENTO_API_KEY}:`).toString("base64")}` }),
  },
  {
    trigger: "OPENWEATHER_API_KEY", label: "OpenWeather", critical: false,
    probe: (e) => get(`https://api.openweathermap.org/data/2.5/weather?q=London&appid=${e.OPENWEATHER_API_KEY}`),
  },
  {
    trigger: "TELEGRAM_BOT_TOKEN", label: "Telegram (main bot)", critical: false,
    probe: (e) => get(`https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/getMe`),
  },
  {
    trigger: "TELEGRAM_FUTURES_BOT_TOKEN", label: "Telegram (futures bot)", critical: false,
    probe: (e) => get(`https://api.telegram.org/bot${e.TELEGRAM_FUTURES_BOT_TOKEN}/getMe`),
  },
  {
    trigger: "LLAMA_CLOUD_API_KEY", label: "LlamaCloud", critical: false,
    probe: (e) => get("https://api.cloud.llamaindex.ai/api/v1/parsing/supported_file_extensions", {
      Authorization: `Bearer ${e.LLAMA_CLOUD_API_KEY}` }),
  },
  {
    trigger: "FIREBASE_API_KEY", label: "Firebase (web key)", critical: false,
    // No auth-free "is this key valid" endpoint; this one 400s on a bad key and
    // 200s on a good one with an empty provider list.
    probe: (e) => fetch(
      `https://identitytoolkit.googleapis.com/v1/projects?key=${e.FIREBASE_API_KEY}`),
  },
  {
    trigger: "THETADATA_API_KEY", label: "ThetaData (local terminal)", critical: false,
    probe: () => get("http://127.0.0.1:25510/v2/system/mdds/status"),
  },
  {
    trigger: "IB_HOST", label: "IBKR gateway (local)", critical: false,
    probe: (e) => get(`http://${e.IB_HOST}:${e.IB_PORT ?? 5000}/`),
  },
];

// ─── env parsing ─────────────────────────────────────────────────────────────

function parseEnv(path: string): Record<string, string> | null {
  if (!existsSync(path)) return null;
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { return null; }
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const mask = (v?: string) => !v ? "(empty)" : v.length <= 8 ? "****" : `${v.slice(0, 4)}…${v.slice(-2)}`;
const fingerprint = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 8);

// ─── run ─────────────────────────────────────────────────────────────────────

type State = "OK" | "DEAD" | "MISSING" | "ERROR" | "WARN";
type Result = {
  project: string; provider: string; trigger: string;
  critical: boolean; state: State; detail: string;
};

/** A scaffold value left from a .env.example copy. It is PRESENT but was never
 *  set, which is a different fact from "the provider rejected it" and needs a
 *  different fix — you cannot regenerate a key that was never issued. Reporting
 *  it as DEAD sends you to a dashboard to hunt for a key that isn't there. */
function isPlaceholder(v: string): boolean {
  return /your[-_ ]?|xxx+|placeholder|replace[-_ ]?me|<.*>|changeme|todo|api[-_]?key[-_]?here/i.test(v)
      || v.length < 12;
}

async function probeOne(project: string, env: Record<string, string>, p: Provider): Promise<Result> {
  const base = { project, provider: p.label, trigger: p.trigger, critical: p.critical };
  const raw = env[p.trigger];
  if (raw && isPlaceholder(raw) && !p.trigger.startsWith("IB_"))
    return { ...base, state: "MISSING" as State,
             detail: `placeholder value, never set — this key was never issued, so there is nothing to regenerate` };
  if (p.assert) {
    const problem = p.assert(env);
    if (problem) return { ...base, state: "WARN" as State, detail: problem };
  }
  try {
    const r = await p.probe(env);
    if (r.status === 401 || r.status === 403)
      return { ...base, state: "DEAD", detail: `HTTP ${r.status} — ${mask(env[p.trigger])} rejected; regenerate at the provider` };
    if (r.status === 400)
      return { ...base, state: "DEAD", detail: `HTTP 400 — key ${mask(env[p.trigger])} not accepted` };
    if (r.status === 599)
      return { ...base, state: "WARN",
               detail: "UNTESTABLE — provider blocks non-browser requests; a fake key returns the same response, so this probe proves nothing either way" };
    if (r.status >= 500)
      return { ...base, state: "ERROR", detail: `HTTP ${r.status} — provider side, not your key` };
    if (r.status >= 404)
      return { ...base, state: "ERROR", detail: `HTTP ${r.status}` };
    return { ...base, state: "OK", detail: `HTTP ${r.status}` };
  } catch (e: any) {
    return { ...base, state: "ERROR",
      detail: e?.name === "AbortError" ? `no response in ${TIMEOUT_MS / 1000}s`
            : String(e?.message ?? e).slice(0, 70) };
  }
}

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const byProject = argv.includes("--by-project");
const driftOnly = argv.includes("--drift");
const quiet = argv.includes("--quiet");

const loaded = ENV_FILES.map((f) => ({ ...f, env: parseEnv(f.path) }))
                        .filter((f) => f.env !== null) as
              { path: string; project: string; note?: string; env: Record<string, string> }[];

// --- drift: same credential, different value, across projects ---
const byKey = new Map<string, { project: string; fp: string }[]>();
for (const f of loaded)
  for (const [k, v] of Object.entries(f.env)) {
    if (!v || /^(0|1|true|false)$/i.test(v) || v.length < 12) continue;   // flags, not secrets
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push({ project: f.project, fp: fingerprint(v) });
  }
const drift = [...byKey.entries()]
  .filter(([, uses]) => uses.length > 1 && new Set(uses.map((u) => u.fp)).size > 1)
  .map(([key, uses]) => ({ key, uses }));

// --- probes ---
const jobs: Promise<Result>[] = [];
for (const f of loaded)
  for (const p of PROVIDERS)
    if (f.env[p.trigger]) jobs.push(probeOne(f.project, f.env, p));

const started = Date.now();
const results = await Promise.all(jobs);
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

// ─── output ──────────────────────────────────────────────────────────────────

const MARK: Record<State, string> = {
  OK: "\x1b[32m✅\x1b[0m", DEAD: "\x1b[31m❌\x1b[0m",
  MISSING: "\x1b[33m⬜\x1b[0m", ERROR: "\x1b[31m⚠️ \x1b[0m", WARN: "\x1b[33m⚠️ \x1b[0m",
};

if (asJson) {
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), elapsed_s: +elapsed, results, drift }, null, 1));
} else if (!quiet) {
  if (!driftOnly) {
    console.log(`\n  ${results.length} credential probes across ${loaded.length} .env files — ${elapsed}s\n`);
    const groups = new Map<string, Result[]>();
    for (const r of results) {
      const k = byProject ? r.project : r.provider;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const rank = (s: State) => ({ DEAD: 0, ERROR: 1, WARN: 2, MISSING: 3, OK: 4 }[s]);
    for (const [name, rs] of [...groups].sort((a, b) =>
        Math.min(...a[1].map((r) => rank(r.state))) - Math.min(...b[1].map((r) => rank(r.state))))) {
      console.log(`  ${name}`);
      for (const r of rs.sort((a, b) => rank(a.state) - rank(b.state))) {
        const where = byProject ? r.provider : r.project;
        const crit = r.critical ? "" : " \x1b[2m(optional)\x1b[0m";
        console.log(`   ${MARK[r.state]} ${where}${crit}`);
        if (r.state !== "OK") console.log(`        \x1b[2m${r.detail}\x1b[0m`);
      }
      console.log();
    }
  }

  if (drift.length) {
    console.log(`  \x1b[33mDRIFT\x1b[0m — same credential, different values across projects:`);
    for (const d of drift) {
      console.log(`   ⚠️  ${d.key}`);
      for (const u of d.uses) console.log(`        ${u.project.padEnd(20)} fingerprint ${u.fp}`);
    }
    console.log(`   \x1b[2mone of each pair is stale — that is how a key dies unnoticed\x1b[0m\n`);
  }

  for (const f of loaded)
    if (f.note) console.log(`  ⚠️  ${f.path.replace(HOME, "~")} — ${f.note}\n`);

  const dead = results.filter((r) => r.state === "DEAD");
  const critDead = dead.filter((r) => r.critical);
  console.log(critDead.length
    ? `  \x1b[31mNOT READY\x1b[0m — ${critDead.length} critical credential(s) dead, ${dead.length} dead total (${elapsed}s)\n`
    : dead.length
    ? `  \x1b[33mDEGRADED\x1b[0m — ${dead.length} optional credential(s) dead, nothing critical (${elapsed}s)\n`
    : `  \x1b[32mALL CONNECTIONS LIVE\x1b[0m (${elapsed}s)\n`);
}

process.exit(results.some((r) => r.critical && r.state === "DEAD") ? 1 : 0);
