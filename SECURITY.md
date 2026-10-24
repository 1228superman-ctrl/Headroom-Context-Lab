# Security Policy — Headroom Context Lab

**Status:** experimental public source; use locally and review permissions before installing.

## Vulnerability reporting

Avoid posting tokens, confidential conversations, or exploit payloads publicly. To report a security issue, use the repository's GitHub **Security** tab and private vulnerability reporting if enabled. If private reporting is unavailable, contact the repository maintainer through GitHub without publishing sensitive details.

## Security boundaries

- Source code and public release archives must not include OAuth tokens, API keys, browser profiles, or local helper credential storage.
- Windows helper binds to `127.0.0.1:18763` and restricts browser-origin access based on the configured extension ID. Localhost access controls do not protect against malicious programs running under the same Windows account.
- Credentials are encrypted with Windows DPAPI for the current user. Reuse the installed helper's start/stop/uninstall scripts; do not copy its credential directory to other machines.
- Manual draft generation doesn't invoke the OpenAI API. AI transmission follows a user review/confirmation action.
- Browser extensions necessarily access the listed AI chat sites to analyze conversations; review permissions and avoid storing or sharing sensitive excerpts.
- ChatGPT and OpenAI upstream APIs, browser DOM and model entitlements may change independently of this project. No guarantee of exhaustive history or exact token counting is made.

Project assets and upstream notices remain subject to [Apache-2.0](LICENSE) and [NOTICE](NOTICE.md).