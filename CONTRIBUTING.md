# Contributing to Headroom Context Lab

Please open an issue (without private content) before proposing major new features. Keep patches focused, add tests to `utils/` or `adapters/` and run:

```sh
npm ci
npm run typecheck
npm run lint
npm run test:run
npm run build:chrome
```

Code affecting authentication, credentials, network access, or ChatGPT history parsing should include a risk analysis and a test for partial/malformed data. Do **not** submit real conversation transcripts, session cookies, bearer tokens, OAuth callback codes, browser profiles, personal API Keys, local helper state, or production credentials.

This is a third-party fork. Respect the original [Headroom](https://github.com/ZM-BAD/headroom) Apache-2.0 license, attribution and existing contributors. Maintain neutral descriptions of AI service plan availability and limitations.