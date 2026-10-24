/** True only while a tab URL still belongs to the history being processed. */
export function isCurrentConversation(
  tabUrl: string | undefined,
  expectedDialogueId: string,
  dialogueIdFromUrl: (url: string) => string | null,
): boolean {
  if (!tabUrl || !expectedDialogueId) return false;
  try {
    return dialogueIdFromUrl(tabUrl) === expectedDialogueId;
  } catch {
    return false;
  }
}
