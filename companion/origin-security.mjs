/**
 * Chrome MV3 host-permitted extension fetches can omit Origin (GET) or
 * rewrite it to the target origin (POST). A dedicated non-simple header is
 * mandatory for real requests to prevent drive-by browser requests.
 */
export function allowedOrigin(origin, extensionId, port) {
  if (origin === undefined) return true; // only with the required header
  return (
    origin === "chrome-extension://" + extensionId ||
    origin === "http://127.0.0.1:" + port
  );
}
export function allowedExtensionRequest(headers, extensionId, port) {
  return (
    allowedOrigin(headers.origin, extensionId, port) &&
    headers["x-headroom-extension"] === extensionId
  );
}
export function allowedPreflight(headers, extensionId, port) {
  if (typeof headers.origin !== "string") return false;
  if (!allowedOrigin(headers.origin, extensionId, port)) return false;
  const method = String(
    headers["access-control-request-method"] || "",
  ).toUpperCase();
  const requested = String(headers["access-control-request-headers"] || "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim());
  return (
    ["GET", "POST"].includes(method) &&
    requested.includes("x-headroom-extension")
  );
}
