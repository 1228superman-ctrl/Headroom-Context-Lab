# Headroom Context Lab

**Estimated historical chat tokens and handover summaries in a Chrome side panel** | [简体中文](README.md)

An independent open-source derivative of [ZM-BAD/headroom](https://github.com/ZM-BAD/headroom), distributed under Apache-2.0. **Not an official Headroom or OpenAI release.**

## Features

- Estimate **cumulative readable conversation text tokens** for the current chat, separating user, assistant and supported tool text.
- Manually refresh the selected conversation without triggering paid summarization.
- On ChatGPT: locally generated draft, a manual prompt to paste into ChatGPT, or optional AI summarization using a user-provided OpenAI API key or qualifying ChatGPT plan authorization.
- Choose **Markdown** or structured **JSON** for AI summaries; edit and copy the result into a new conversation **yourself**.
- Optional per-user Windows localhost companion with DPAPI credential storage and startup integration.

**Caution:** cumulative readable history is **not** actual remaining context capacity, and may be truncated or incomplete. A generated handover does not verify claims by inspecting files, repositories, or external services.

## Install

Use recent Chrome and Node.js 24+:

```sh
npm ci
npm run build:chrome
```

Open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose `.output/chrome-mv3`. Open a ChatGPT conversation, then the side panel.

**Optional AI summaries on Windows:** after loading the extension, double-click `companion/Install-Headroom.cmd`. It installs a user-only helper and may request your 32-character extension ID from `chrome://extensions`. In the panel select **Check local service** before supplying your own API key or authorizing a qualifying ChatGPT plan. Uninstall via `companion/Uninstall-Headroom.cmd`. See [companion/README.md](companion/README.md).

Manual prompt generation does not call an AI API. For automated summarization, **only your explicitly reviewed and confirmed excerpt** is sent to OpenAI via the local companion. Nothing is sent to a new conversation automatically. API key usage is billed separately; plan access requires eligibility and the appropriate permission. See [OpenAI's open-source client sign-in guide](https://developers.openai.com/siwc/token-sharing-open-source).

## Limitations and privacy

History extraction depends on supported website APIs and page content; long chats may contain clipped or missing excerpts. A DOM-only fallback is marked **partial**. Optional Upstash sync is user-managed and inherited from upstream; there is no developer-hosted backend. API credentials and OAuth tokens are not included in the source and are stored in the user's Windows account via DPAPI. See [PRIVACY.md](PRIVACY.md).

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm run test:run
npm run build:chrome
```

Companion selftests live in `companion/selftest*.mjs`. Automated test success does not establish end-to-end success on every account, chat, or inference plan.

## Attribution

Independent Apache-2.0 derivative of [ZM-BAD/headroom](https://github.com/ZM-BAD/headroom). Upstream copyrights and the full license are retained. See [NOTICE](NOTICE.md).

## v0.6.10 - Recoverable handovers
- Chat-switch-safe drafts and model outputs, kept per conversation ID in browser.storage.session (cleared after browser restart; six-hour restore window).
- Automatic AI summaries run in the optional localhost helper, even when the side panel closes; job results remain in helper process memory for one hour.
- Client-generated idempotent job IDs avoid repeated billable requests when the original response is lost.
- Return to the original ChatGPT conversation to recover draft/output; no automatic posting, no permanent conversation archive.
- New QA includes chat isolation/expiry unit tests and async-job input validation. Automatic summarization still requires explicit review and confirmation.