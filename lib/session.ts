const encoder = new TextEncoder();
export const SESSION_COOKIE = "pharma_session";
async function key() {
  return crypto.subtle.importKey("raw", encoder.encode(`${process.env.AUTH_SECRET ?? "development"}:${process.env.APP_USERNAME ?? ""}:${process.env.APP_PASSWORD ?? ""}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
export async function createSession() {
  const expires = String(Date.now() + 8 * 60 * 60 * 1000);
  const signature = await crypto.subtle.sign("HMAC", await key(), encoder.encode(expires));
  return `${expires}.${encode(new Uint8Array(signature))}`;
}
export async function validSession(token: string | undefined) {
  if (!token || !process.env.APP_PASSWORD) return false;
  const [expires, signature, extra] = token.split(".");
  if (extra || !signature || !/^\d+$/.test(expires) || Number(expires) <= Date.now() || Number(expires) > Date.now() + 8 * 60 * 60 * 1000) return false;
  try {
    const bytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), character => character.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", await key(), bytes, encoder.encode(expires));
  } catch { return false; }
}
