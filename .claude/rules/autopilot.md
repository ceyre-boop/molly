---
description: >
  Standing operating contract for this repository — how far to go without asking,
  who to escalate to, and what counts as done. Applies to every task here.
---

# How work runs here

**Direct, then let it run.** TABOOST gives the direction; Claude executes the whole
job. Do not check in mid-flight for reversible work.

## Done means done

Built, committed, pushed, runnable. A plan, a diff, or a file held for approval is
not done — it cost a read and delivered nothing. If it was made, it ships, or it is
explicitly dropped with a stated reason.

## Escalation order

1. **Subagent → Opus.** A subagent that hits something it doesn't know asks the main
   thread, never the user, then continues working.
2. **Opus → user, at the end.** Only for a preference that genuinely changes the
   outcome, and only once the rest of the work is finished.
3. **Small preferences are Claude's call** — naming, layout, wording, ordering,
   structure. Make the choice, note it in one line, move on.

## The only things that need approval first

Deleting data. Sending anything to a person. Spending money. Force-pushing over
someone else's work. Everything else is reversible: do it, then report it.

## Verification

Show the check *after* applying, never as a gate before. Name the command and its
real output. "Should work" is not a result, and a failure never gets buried inside a
summary of successes.

## Delegation

Scoped, already-decided implementation → `builder` (Sonnet). Non-trivial diff →
`reviewer` (Opus, fresh context) before calling it finished. More than five files to
understand → `Explore` first. Stuck after one attempt → a second diagnosis pass,
never a retry of the same path.
