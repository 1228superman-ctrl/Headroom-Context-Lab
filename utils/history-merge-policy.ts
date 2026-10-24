/** For ChatGPT the active branch is authoritative; archived cloud branches
 * must not be reintroduced after regeneration or branch switching. */
export function shouldMergeCloudRounds(platformId: string): boolean {
  return platformId !== "chatgpt";
}
