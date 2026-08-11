#!/usr/bin/env bun
/**
 * Morning standup reporter — counts open Claude PRs on the sandbox repo,
 * announces via Pulse voice notify, and updates activity.json for the dashboard.
 * Usage: bun standup-report.ts
 */

const REPO = "ceyre-boop/outreach-builder";
const MOLLY_DIR = process.env.MOLLY_DIR || `${process.env.HOME}/molly`;
const ACTIVITY_FILE = `${MOLLY_DIR}/activity.json`;

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

// Update activity.json for dashboard
interface ActivityEntry {
  ts: string;
  kind: "pr" | "dispatch";
  title: string;
  repo: string;
  url: string;
}

try {
  let activity: ActivityEntry[] = [];
  try {
    const existing = await Bun.file(ACTIVITY_FILE).text();
    activity = JSON.parse(existing);
  } catch {
    // File doesn't exist or is invalid, start fresh
  }

  // Add new PR entries, dedup by URL
  const seenUrls = new Set(activity.map((a) => a.url));
  const newEntries: ActivityEntry[] = prs
    .filter((p) => !seenUrls.has(p.url))
    .map((p) => ({
      ts: new Date().toISOString(),
      kind: "pr" as const,
      title: p.title,
      repo: REPO.split("/")[1],
      url: p.url,
    }));

  // Prepend new entries and cap at 20
  activity = [...newEntries, ...activity].slice(0, 20);
  await Bun.write(ACTIVITY_FILE, JSON.stringify(activity, null, 2) + "\n");
  console.log(`Updated ${ACTIVITY_FILE} (${activity.length} entries)`);

  // Commit and push if there are new entries
  if (newEntries.length > 0) {
    const commitProc = Bun.spawnSync([
      "git", "-C", MOLLY_DIR, "add", "activity.json",
    ]);
    if (commitProc.exitCode === 0) {
      const msgProc = Bun.spawnSync([
        "git", "-C", MOLLY_DIR, "commit",
        "-m", "chore: update overnight activity feed",
        "-q",
      ]);
      if (msgProc.exitCode === 0 || msgProc.exitCode === 1) {
        // exitCode 1 means nothing to commit, which is fine
        const pushProc = Bun.spawnSync([
          "git", "-C", MOLLY_DIR, "push", "origin", "main", "-q",
        ]);
        if (pushProc.exitCode !== 0) {
          console.error("Warning: push failed");
        }
      }
    }
  }
} catch (e) {
  console.error("Failed to update activity.json:", e);
  // Don't fail the standup if activity write fails
}

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
