# Changelog

## 0.6.11 — Monitoring reminders and accurate ratio (2026-10-25)
- Toolbar percentage now shows true historical/reference ratio (116% in the reported case).
- Adds configurable 70/85/95% reference alerts, optional system popups, and stage deduplication.
- Carries forward locally verified sidebar stability, content-script recovery, and recoverable summary jobs.


## 0.6.10 — Recoverable handovers (2026-10-25)
- Preserve per-chat handover drafts and results in browser session storage when switching tabs.
- Run user-confirmed summaries as recoverable localhost jobs with idempotent request IDs.
- Restore accepted tasks after sidebar closure and prevent cross-conversation text leakage.
- Add expiry, validation, and session-state tests.

## 0.6.9 — first open-source test release (2026-10-24)

- Refined current-conversation historical token display; removed misleading actual-context occupancy claims.
- Added handover drafting and manual AI summary prompts.
- Added opt-in localhost companion for API and qualifying ChatGPT-plan AI summaries.
- Added Markdown and JSON output selections with JSON validation warning.
- Added history-read retry, diagnostic errors, and explicitly marked partial visible-page fallback.
- Added Windows current-user install, auto-start and uninstall scripts.
- Preserved upstream Headroom functionality and attribution.

**Known limits:** tool outputs/attachments may not be fully available; long conversations can be truncated; full end-to-end inference is account-dependent and not exhaustively validated.