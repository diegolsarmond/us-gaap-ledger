export function isCrossOriginWrite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return true;
  // Browsers control Sec-Fetch-Site; page scripts cannot forge it. This
  // remains accurate when TLS terminates at a proxy and request.url is HTTP.
  if (site === "same-origin") return false;

  const origin = request.headers.get("origin");
  return origin !== null && origin !== new URL(request.url).origin;
}
