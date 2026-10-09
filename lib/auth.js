// Small, dependency-free signing helpers.
// - Admin login: a cookie holding "expiry.signature", signed with ADMIN_SECRET.
// - Unsubscribe links: a signature of the email address, so nobody can unsubscribe someone else.
import { createHmac, timingSafeEqual } from "node:crypto";

const sign = (secret, value) => createHmac("sha256", secret).update(value).digest("base64url");

export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export const COOKIE = "mul_admin";
const HOURS = 12;

export function makeSession(secret, now = Date.now()) {
  const exp = String(now + HOURS * 3600 * 1000);
  return `${exp}.${sign(secret, "admin:" + exp)}`;
}

export function checkSession(secret, token, now = Date.now()) {
  if (!secret || !token) return false;
  const [exp, sig] = String(token).split(".");
  if (!exp || !sig || Number(exp) < now) return false;
  return safeEqual(sig, sign(secret, "admin:" + exp));
}

export function readCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function sessionCookie(token, maxAgeSeconds = HOURS * 3600) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export const unsubToken = (secret, email) => sign(secret, "unsub:" + String(email).toLowerCase()).slice(0, 32);
export const checkUnsub = (secret, email, token) => !!secret && !!token && safeEqual(unsubToken(secret, email), token);
