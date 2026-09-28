/**
 * Molly Console — reply text.
 *
 * What the console says back (on screen and through Pulse) after routing a
 * transcript. Kept pure so the wording is unit tested.
 */

export const INBOX_ACK = "Noted on your desk."

export function dispatchAck(repo: string, title: string): string {
  return `Filed on ${repo}: ${title}`
}

export function dispatchFailure(error: string): string {
  return `Couldn't file that issue: ${error}`
}
