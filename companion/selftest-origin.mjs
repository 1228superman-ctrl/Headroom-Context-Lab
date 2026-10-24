/* global console */
import assert from "node:assert/strict";
import {
  allowedExtensionRequest,
  allowedPreflight,
} from "./origin-security.mjs";
const id = "a".repeat(32),
  port = 18763;
const ext = "chrome-extension://" + id;
const local = "http://127.0.0.1:" + port;
for (const origin of [undefined, ext, local]) {
  assert.equal(
    allowedExtensionRequest({ origin, "x-headroom-extension": id }, id, port),
    true,
  );
  assert.equal(allowedExtensionRequest({ origin }, id, port), false);
}
for (const origin of [
  "https://evil.example",
  "null",
  "chrome-extension://" + "b".repeat(32),
]) {
  assert.equal(
    allowedExtensionRequest({ origin, "x-headroom-extension": id }, id, port),
    false,
  );
}
for (const origin of [ext, local]) {
  assert.equal(
    allowedPreflight(
      {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-headroom-extension",
      },
      id,
      port,
    ),
    true,
  );
}
assert.equal(
  allowedPreflight(
    {
      origin: "https://evil.example",
      "access-control-request-method": "POST",
      "access-control-request-headers": "x-headroom-extension",
    },
    id,
    port,
  ),
  false,
);
assert.equal(
  allowedPreflight(
    {
      origin: ext,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
    id,
    port,
  ),
  false,
);
console.log(
  "Loopback extension origin cases, mandatory header and CSRF preflight: PASS",
);
