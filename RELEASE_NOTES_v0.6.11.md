# Headroom Context Lab v0.6.11

## Accurate historical-token monitoring alerts

- The toolbar badge now shows the actual rounded historical token estimate / chosen reference amount: **231,239 / 200,000 = 116%** (before: wrong threshold label 95%).
- Badge colors retain three configurable warning levels (default 70% / 85% / 95%). Above 999% the badge shows 999+ to fit.
- The side panel labels the ratio as historical total / user-configured reference, including when the reference is exceeded.
- Optional system notifications remain disabled by default and deduplicated per conversation and stage.
- **This is an estimate of conversation history**, not real-time model context use or remaining token capacity.

## Included since public v0.6.9

- v0.6.10 local fixes: stable side panel and handover drafts across page switches, clear progress display, content-script reconnection, and improved handover instructions.
- User-approved AI summary jobs remain running in the Windows localhost helper after the sidebar closes; results can be recovered in the original conversation.
- New regression tests for badge values, alert stages and recovery.

## Installation

Update the Chrome extension to see the badge and monitoring changes. If using recoverable automatic summary tasks, update the Windows companion helper too.

1. Extract the Chrome archive and load its manifest.json directory as an unpacked extension. Reload an existing installation from chrome://extensions.
2. Refresh existing ChatGPT tabs after extension reload.
3. Optional: Extract the Windows helper, run companion/Install-Headroom.cmd, and check the helper service from the side panel.
4. For desktop pop-up reminders, enable the separate notification option and save settings.

No summary is automatically posted to a new ChatGPT conversation. Drafts and helper job results are stored temporarily, not permanently.

Apache-2.0 derivative of ZM-BAD/headroom. Not an official OpenAI product.
