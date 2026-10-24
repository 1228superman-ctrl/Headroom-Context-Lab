import type { UsageState } from "./messages";

/** A stable per-conversation target. Never infer a refresh result from another chat. */
export function refreshIdentity(
  state: Pick<UsageState, "platformId" | "dialogueId">,
): string | null {
  return state.platformId && state.dialogueId
    ? state.platformId + ":" + state.dialogueId
    : null;
}

export function isSameRefreshTarget(
  target: string | null,
  state: Pick<UsageState, "platformId" | "dialogueId">,
): boolean {
  return target !== null && refreshIdentity(state) === target;
}
