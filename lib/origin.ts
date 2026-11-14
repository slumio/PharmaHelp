/** Validate against the public Host header; URL origins can use an internal host behind proxies. */
export function correctOrigin(request: { headers: Headers }) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (process.env.APP_ORIGIN && origin === process.env.APP_ORIGIN) return true;
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.host === request.headers.get("host");
  } catch { return false; }
}
