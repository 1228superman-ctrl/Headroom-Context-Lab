# Privacy Policy — Headroom Context Lab

This is an independent open-source fork; its privacy behavior differs from the original Headroom extension.

## Data used locally

The extension reads supported AI chat conversation text to estimate historical token counts, and may temporarily build ChatGPT handover excerpts. Normal numeric estimates, titles/IDs and preferences may be retained in local browser storage. The raw handover excerpt and AI-generated summary stay in the current side panel for user review/copy; they are not automatically saved as a conversation archive.

Long histories may be sampled, clipped, or unavailable. If the ChatGPT history API cannot be read, the optional visible-page fallback may be **partial**. Source text and evidence coverage must be reviewed before trusting a summary.

## Transmission to OpenAI

Generating a local draft or manual ChatGPT summary prompt **does not send the prompt to an AI API**. For API or qualifying ChatGPT plan summarization, the user chooses the provider, reviews/edits the prepared input, and **explicitly clicks Generate handover summary**. Only then does the browser call the user's locally installed helper, which sends the reviewed text to the official OpenAI Responses API over HTTPS. The API or ChatGPT plan may impose charges or usage limits. No generated text is sent into any new chat automatically.

## Credentials and optional synchronization

The Windows localhost helper listens only at `127.0.0.1:18763`, and uses current-user DPAPI-protected files in `%LOCALAPPDATA%\HeadroomContextLab` for API keys and OAuth credentials; these files are **not part of this repository**. The Chrome extension may separately store Upstash REST settings if the user voluntarily enables the upstream bring-your-own-key sync. This is a **user-controlled third-party service**, not a developer-hosted Headroom Context Lab server.

The helper does not write AI prompts or summaries to disk. For recovery in v0.6.10 it temporarily holds completed summaries in process memory for up to one hour. OpenAI and Upstash may process or retain information according to their respective terms and user settings.

## Controls and limitations

Users can edit the outgoing summary input, disconnect their ChatGPT connection, clear their local API Key, uninstall the helper, and remove the Chrome extension. Uninstalling the helper removes its own credential files; removing the extension clears its extension storage through the browser. Do not share credentials, chat IDs, exported excerpts or private files with public GitHub issues.

This project is not an official OpenAI product and does not infer the model's actual remaining context budget.

## v0.6.10 - Recoverable handovers
- Chat-switch-safe drafts and model outputs, kept per conversation ID in browser.storage.session (cleared after browser restart; six-hour restore window).
- Automatic AI summaries run in the optional localhost helper, even when the side panel closes; job results remain in helper process memory for one hour.
- Client-generated idempotent job IDs avoid repeated billable requests when the original response is lost.
- Return to the original ChatGPT conversation to recover draft/output; no automatic posting, no permanent conversation archive.
- New QA includes chat isolation/expiry unit tests and async-job input validation. Automatic summarization still requires explicit review and confirmation.