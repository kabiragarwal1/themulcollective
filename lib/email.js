// Sending email through Resend (https://resend.com), free plan: 3,000 emails a month, 100 a day.
//
// Environment variables:
//   RESEND_API_KEY    re_… key from Resend
//   EMAIL_FROM        e.g. "The MUL Collection <hello@themulcollection.com>" (domain verified in Resend)
//   EMAIL_REPLY_TO    optional, where replies go (e.g. your Gmail)
//   ADMIN_EMAIL       where new-order alerts and test emails go
//   BUSINESS_ADDRESS  postal address shown in newsletter footers (US CAN-SPAM requires one)
//   EMAIL_DAILY_LIMIT optional, defaults to 100 (Resend free plan)
import { store } from "./store.js";
import { unsubToken } from "./auth.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const emailReady = (env) => !!(env.RESEND_API_KEY && env.EMAIL_FROM);
export const dailyLimit = (env) => Math.max(1, Number(env.EMAIL_DAILY_LIMIT) || 100);

export function unsubscribeUrl(env, site, email) {
  const t = unsubToken(env.ADMIN_SECRET, email);
  return `${site}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${t}`;
}

// Plain text from the admin becomes simple, on-brand HTML. Blank lines make paragraphs.
export function renderNewsletter({ body, unsubscribe, address, site }) {
  const paras = String(body).trim().split(/\n\s*\n/).map((p) =>
    `<p style="margin:0 0 16px;line-height:1.6">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#F8F3EA">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Helvetica,Arial,sans-serif;color:#2A2320;font-size:16px">
<p style="margin:0 0 24px;letter-spacing:.16em;font-size:13px;text-transform:uppercase">The <b>MUL</b> Collection</p>
${paras}
<hr style="border:0;border-top:1px solid #d9cfc0;margin:28px 0 16px">
<p style="margin:0;font-size:12px;color:#6b5f57;line-height:1.5">You're receiving this because you joined The MUL Collection list or ordered from us.
<a href="${esc(unsubscribe)}" style="color:#A8432F">Unsubscribe</a> · <a href="${esc(site)}" style="color:#A8432F">themulcollection.com</a>${address ? `<br>${esc(address)}` : ""}</p>
</div></body></html>`;
  const text = `${String(body).trim()}\n\n—\nUnsubscribe: ${unsubscribe}\n${site}${address ? `\n${address}` : ""}\n`;
  return { html, text };
}

async function resend(env, path, payload) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Resend error ${res.status}`);
  return data;
}

// Count of emails sent today, so we stay under the free plan's daily cap.
const today = () => new Date().toISOString().slice(0, 10);
export async function sentToday() {
  return (await store("email-meta").get("sent-" + today(), { type: "json" }))?.count || 0;
}
async function addSent(n) {
  const key = "sent-" + today();
  const cur = (await store("email-meta").get(key, { type: "json" }))?.count || 0;
  await store("email-meta").setJSON(key, { count: cur + n });
}

export async function sendOne(env, { to, subject, html, text, headers }) {
  const data = await resend(env, "/emails", {
    from: env.EMAIL_FROM, to: [to], subject, html, text,
    ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
    ...(headers ? { headers } : {}),
  });
  await addSent(1);
  return data;
}

// Send a newsletter to a list of customers, one personalised email each (own unsubscribe link),
// in batches of up to 100, stopping at the daily cap. Returns who got it and who's left.
export async function sendNewsletter(env, site, { subject, body, recipients }) {
  if (!emailReady(env)) throw new Error("Email isn't set up yet: add RESEND_API_KEY and EMAIL_FROM in Netlify.");
  const room = Math.max(0, dailyLimit(env) - (await sentToday()));
  const now = recipients.slice(0, room), later = recipients.slice(room);
  const sent = [];
  for (let i = 0; i < now.length; i += 100) {
    const chunk = now.slice(i, i + 100);
    const batch = chunk.map((c) => {
      const unsub = unsubscribeUrl(env, site, c.email);
      const { html, text } = renderNewsletter({ body, unsubscribe: unsub, address: env.BUSINESS_ADDRESS, site });
      return {
        from: env.EMAIL_FROM, to: [c.email], subject, html, text,
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
        headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      };
    });
    await resend(env, "/emails/batch", batch);
    await addSent(chunk.length);
    sent.push(...chunk.map((c) => c.email));
  }
  return { sent, notSent: later.map((c) => c.email) };
}

export function orderAlert(order) {
  const a = order.shipping_address || {};
  const addr = [a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country].filter(Boolean).join(", ");
  const total = (order.amount_total / 100).toFixed(2);
  const subject = `New order: ${order.packing_list} ($${total})`;
  const text = `New order on themulcollection.com\n\n${order.packing_list}\nTotal: $${total} ${String(order.currency || "").toUpperCase()}\n\nShip to: ${order.name || ""}\n${addr}\nEmail: ${order.email || ""}\nPhone: ${order.phone || ""}\n\nStripe session: ${order.id}\n`;
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#2A2320">${esc(text).replace(/\n/g, "<br>")}</div>`;
  return { subject, text, html };
}
