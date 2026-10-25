# Headroom Context Lab v0.6.9 — first open-source beta

Independent Apache-2.0 derivative of [ZM-BAD/headroom](https://github.com/ZM-BAD/headroom); not affiliated with upstream maintainers or OpenAI.

## Features

- Estimated cumulative **readable historical chat tokens** — not actual remaining model context.
- Editable ChatGPT handovers: local drafts, manual summary prompts, optional OpenAI API or eligible ChatGPT-plan AI summaries.
- Markdown (default) and JSON output; generated summaries are **manually copied** into new chats.
- Optional Windows localhost companion, current-user startup and DPAPI credential encryption.
- Visible warnings for incomplete history and model/API failures.

## Install

1. Download and extract the **Chrome** ZIP. Enable Developer mode at chrome://extensions, click **Load unpacked**, and select the extracted folder containing manifest.json.
2. Optional AI summarization on Windows: download and extract the **Windows Companion** ZIP; install Node.js 24+, then double-click companion/Install-Headroom.cmd. The helper is not required for manual summaries.
3. Review the prepared text before confirming AI summarization. The helper sends your approved excerpt to OpenAI, subject to API billing or qualifying ChatGPT plan limits; it **does not** send messages to a new chat automatically.

See [README](https://github.com/1228superman-ctrl/Headroom-Context-Lab#readme) for details.

## Known limitations

Chat history extraction is best-effort; early text, tool results or attachments may be missing or clipped. Plan access depends on account eligibility and authorization permissions. This beta is **not** a Chrome Web Store version. Never share credentials or private conversation excerpts in public issues.
