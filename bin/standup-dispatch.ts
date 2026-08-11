#!/usr/bin/env bun
/**
 * Morning standup dispatcher — Molly's desk.
 * Reads NEXT.md for sections tagged #dispatch, files each as a GitHub issue
 * (label: claude, mention: @claude) on the sandbox repo, then rewrites the tag
 * to #dispatched(#<issue>) so re-runs are idempotent.
 *
 * Safety properties:
 *  - Opt-in only: untagged vault text is never touched.
 *  - Vault text becomes an issue BODY, never a shell command.
 *  - Hard cap per run (default 3) — review bandwidth is the bottleneck.
 *  - Targets ONLY the repo below. Production repos are out of scope by design.
 *
 * Usage: bun standup-dispatch.ts [--dry-run]
 */

const REPO = "ceyre-boop/outreach-builder"; // sandbox only — never point at TABOOST_Platfrom
const NEXT_MD = `${process.env.HOME}/Obsidian/Obsidian/00-BRAIN/NEXT.md`;
const CAP = 3;
const DRY = process.argv.includes("--dry-run");

const file = Bun.file(NEXT_MD);
if (!(await file.exists())) {
  console.error(`NEXT.md not found at ${NEXT_MD}`);
  process.exit(1);
}
let text = await file.text();

// Sections = heading line (## ...) through the next heading of same-or-higher level.
const sections: { title: string; body: string; start: number; end: number }[] = [];
const headingRe = /^(#{2,4})\s+(.+)$/gm;
const matches = [...text.matchAll(headingRe)];
for (let i = 0; i < matches.length; i++) {
  const m = matches[i];
  const start = m.index!;
  const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
  sections.push({ title: m[2].trim(), body: text.slice(start, end).trim(), start, end });
}

const pending = sections.filter(
  (s) => /(^|\s)#dispatch(\s|$)/.test(s.body) && !/#dispatched\(/.test(s.body)
);

if (pending.length === 0) {
  console.log("Nothing tagged #dispatch. Done.");
  process.exit(0);
}
const batch = pending.slice(0, CAP);
if (pending.length > CAP) {
  console.log(`${pending.length} tagged; capping at ${CAP}, rest queue for tomorrow.`);
}

for (const s of batch) {
  const title = s.title.replace(/#dispatch\S*/g, "").trim();
  const body = `${s.body.replace(/(^|\s)#dispatch(\s|$)/, "$1$2").trim()}\n\n@claude\n\n_Dispatched from NEXT.md by Molly's morning standup._`;
  if (DRY) {
    console.log(`[dry-run] would file: "${title}"`);
    continue;
  }
  const proc = Bun.spawnSync([
    "gh", "issue", "create", "--repo", REPO,
    "--label", "claude", "--title", title, "--body", body,
  ]);
  const out = proc.stdout.toString().trim();
  if (proc.exitCode !== 0) {
    console.error(`Failed to file "${title}": ${proc.stderr.toString()}`);
    continue;
  }
  const num = out.match(/\/issues\/(\d+)/)?.[1] ?? "?";
  console.log(`Filed #${num}: ${title} (${out})`);
  // Idempotency: rewrite the tag in this section only.
  const updated = s.body.replace(/(^|\s)#dispatch(\s|$)/, `$1#dispatched(#${num})$2`);
  text = text.replace(s.body, updated);
}

if (!DRY) {
  await Bun.write(NEXT_MD, text);
  console.log("NEXT.md updated with #dispatched tags.");
}
