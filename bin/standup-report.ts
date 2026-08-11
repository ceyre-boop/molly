#!/usr/bin/env bun
/**
 * Morning standup reporter — counts open Claude PRs on the sandbox repo and
 * announces via Pulse voice notify (localhost:31337).
 * Usage: bun standup-report.ts
 */

const REPO = "ceyre-boop/outreach-builder";

const proc = Bun.spawnSync([
  "gh", "pr", "list", "--repo", REPO, "--state", "open",
  "--json", "number,title,headRefName,url",
]);
if (proc.exitCode !== 0) {
  console.error(proc.stderr.toString());
  process.exit(1);
}
const prs = (JSON.parse(proc.stdout.toString()) as
  { number: number; title: string; headRefName: string; url: string }[])
  .filter((p) => p.headRefName.startsWith("claude/"));

const msg =
  prs.length === 0
    ? "Morning standup: no Claude PRs waiting on outreach builder."
    : `Morning standup: ${prs.length} PR${prs.length > 1 ? "s" : ""} ready for review on outreach builder.`;

console.log(msg);
for (const p of prs) console.log(`  #${p.number} ${p.title} — ${p.url}`);

try {
  await fetch("http://localhost:31337/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg, voice_enabled: true }),
    signal: AbortSignal.timeout(5000),
  });
} catch {
  console.error("Pulse notify unreachable — console output only.");
}
