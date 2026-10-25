/** Recover an existing ChatGPT tab after an extension hot reload.
 * Never reload a user tab or retry requests unrelated to missing receivers.
 */
export function isMissingContentReceiver(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /receiving end does not exist|could not establish connection/i.test(
    message,
  );
}

/** Safe for user-triggered, read-only messages. At most one reinjection. */
export async function withContentReceiverRecovery<T>(
  send: () => Promise<T>,
  restore: () => Promise<void>,
): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!isMissingContentReceiver(error)) throw error;
    await restore();
    return await send();
  }
}