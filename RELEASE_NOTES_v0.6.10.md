# Headroom Context Lab v0.6.10 — Recoverable Handover

This release fixes the loss of handover drafts and AI summaries when navigating between browser tabs or closing and reopening the extension side panel.

## Fixes

- Drafts, edited input and generated handovers are saved per conversation in browser session storage, isolated from other chats.
- Switching tabs no longer discards a response from the original ChatGPT conversation.
- Optional automatic AI summaries run as **localhost jobs**, so the browser side panel may close without canceling an accepted job.
- Each request receives a client-generated, idempotent job ID. Lost HTTP replies can be checked without automatically sending a second billable request.
- Explicit failure states, expiry controls and security tests.

## Privacy and limitations

- Browser session storage is temporary and cleared on browser restart. Items are eligible for restoration for up to six hours.
- The Windows helper keeps completed job results only in process memory for up to one hour. Restarting the helper discards outstanding jobs and results.
- The addon never sends a generated summary to a new chat automatically. AI calls still require explicit review and confirmation.
- Long conversation extraction can be partial. Token totals are historical **estimates**, not remaining context budget.

## Installation

Download both updated archives if you use automatic summaries. **The Chrome extension and Windows helper must both be updated to v0.6.10 for recoverable automatic jobs to work.**

1. Extract the Chrome package, then load its folder containing manifest.json in `chrome://extensions` (or reload an existing unpacked extension at the updated path).
2. Optional on Windows: install Node.js 24+, extract the Companion package, and double-click `companion/Install-Headroom.cmd`. A helper previously installed with the same extension ID will be upgraded.
3. Check `检查本机服务`, confirm API Key or eligible ChatGPT plan access and test with non-sensitive material first.

Independent open-source derivative of [ZM-BAD/headroom](https://github.com/ZM-BAD/headroom), Apache-2.0. Not an official OpenAI or Headroom release.