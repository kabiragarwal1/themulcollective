// /api/admin/*  — everything the admin page (/admin) talks to. All routes except login need
// the signed admin cookie, and every POST must carry the "x-admin: 1" header (a simple guard
// against other websites submitting forms on your behalf).
//
// Environment variables:
//   ADMIN_PASSWORD   the password you type on /admin
//   ADMIN_SECRET     a long random string used to sign the login cookie and unsubscribe links
//   + the email variables listed in lib/email.js
import { makeSession, checkSession, readCookie, sessionCookie, safeEqual, COOKIE } from "../../lib/auth.js";
import { store, readAll } from "../../lib/store.js";
import { listCustomers, pickAudience, customersCsv, setMarketing, isEmail } from "../../lib/customers.js";
import { emailReady, sendOne, sendNewsletter, sentToday, dailyLimit, renderNewsletter, unsubscribeUrl } from "../../lib/email.js";

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

const site = (req) => process.env.URL || new URL(req.url).origin;

async function tooManyFailures(ip) {
  const rec = await store("admin-meta").get("fail-" + ip, { type: "json" });
  return rec && rec.count >= 5 && Date.now() - rec.first < 15 * 60 * 1000;
}
async function noteFailure(ip) {
  const s = store("admin-meta"), k = "fail-" + ip;
  const rec = await s.get(k, { type: "json" });
  const fresh = !rec || Date.now() - rec.first > 15 * 60 * 1000;
  await s.setJSON(k, fresh ? { count: 1, first: Date.now() } : { ...rec, count: rec.count + 1 });
}

export default async (req, context) => {
  const env = process.env;
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SECRET) return json({ error: "Admin isn't set up: add ADMIN_PASSWORD and ADMIN_SECRET in Netlify." }, 503);

  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, "");
  const method = req.method;
  if (method === "POST" && req.headers.get("x-admin") !== "1") return json({ error: "Missing header." }, 400);
  const body = method === "POST" ? await req.json().catch(() => ({})) : {};

  // ---- Login / logout (no cookie needed) ----
  if (route === "login" && method === "POST") {
    const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
    if (await tooManyFailures(ip)) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
    if (!safeEqual(body.password || "", env.ADMIN_PASSWORD)) {
      await noteFailure(ip);
      await new Promise((r) => setTimeout(r, 800));
      return json({ error: "Wrong password." }, 401);
    }
    await store("admin-meta").delete("fail-" + ip);
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(makeSession(env.ADMIN_SECRET)) });
  }
  if (route === "logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  }

  if (!checkSession(env.ADMIN_SECRET, readCookie(req, COOKIE))) return json({ error: "Please log in." }, 401);

  // ---- Status ----
  if (route === "me" && method === "GET") {
    return json({ ok: true, email: { ready: emailReady(env), from: env.EMAIL_FROM || null, admin: env.ADMIN_EMAIL || null,
      sentToday: await sentToday(), limit: dailyLimit(env), address: !!env.BUSINESS_ADDRESS } });
  }

  // ---- Orders ----
  if (route === "orders" && method === "GET") {
    const orders = (await readAll("orders")).sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    return json({ orders });
  }
  if (route === "orders/ship" && method === "POST") {
    const s = store("orders");
    const o = await s.get(String(body.id || ""), { type: "json" });
    if (!o) return json({ error: "Order not found." }, 404);
    o.fulfilled = !!body.shipped;
    o.shipped_at = o.fulfilled ? new Date().toISOString() : null;
    await s.setJSON(o.id, o);
    return json({ order: o });
  }

  // ---- Customers ----
  if (route === "customers" && method === "GET") {
    const customers = await listCustomers();
    if (url.searchParams.get("format") === "csv") {
      return new Response(customersCsv(customers), { headers: {
        "content-type": "text/csv; charset=utf-8", "cache-control": "no-store",
        "content-disposition": `attachment; filename="mul-customers-${new Date().toISOString().slice(0, 10)}.csv"` } });
    }
    return json({ customers });
  }
  if (route === "customers/marketing" && method === "POST") {
    if (!["subscribed", "unsubscribed", "none"].includes(body.status)) return json({ error: "Bad status." }, 400);
    const c = await setMarketing(body.email, body.status);
    return c ? json({ customer: c }) : json({ error: "Customer not found." }, 404);
  }

  // ---- Email ----
  const checkDraft = () => {
    const subject = String(body.subject || "").trim(), text = String(body.body || "").trim();
    if (!subject || !text) throw new Error("Add a subject and a message.");
    if (subject.length > 150) throw new Error("Keep the subject under 150 characters.");
    return { subject, text };
  };
  if (route === "email/preview" && method === "POST") {
    try {
      const { subject, text } = checkDraft();
      const { html } = renderNewsletter({ body: text, unsubscribe: unsubscribeUrl(env, site(req), "preview@example.com"), address: env.BUSINESS_ADDRESS, site: site(req) });
      const customers = await listCustomers();
      const recipients = pickAudience(customers, body.audience, body.selected || []);
      return json({ subject, html, count: recipients.length });
    } catch (e) { return json({ error: e.message }, 400); }
  }
  if (route === "email/test" && method === "POST") {
    try {
      const { subject, text } = checkDraft();
      if (!emailReady(env) || !isEmail(env.ADMIN_EMAIL)) return json({ error: "Email isn't set up yet (RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL)." }, 503);
      const { html, text: plain } = renderNewsletter({ body: text, unsubscribe: unsubscribeUrl(env, site(req), env.ADMIN_EMAIL), address: env.BUSINESS_ADDRESS, site: site(req) });
      await sendOne(env, { to: env.ADMIN_EMAIL, subject: "[Test] " + subject, html, text: plain });
      return json({ ok: true, to: env.ADMIN_EMAIL });
    } catch (e) { return json({ error: e.message }, 400); }
  }
  if (route === "email/send" && method === "POST") {
    try {
      const { subject, text } = checkDraft();
      if (!env.BUSINESS_ADDRESS) return json({ error: "Add BUSINESS_ADDRESS in Netlify first: US law requires a postal address in marketing emails." }, 400);
      const recipients = pickAudience(await listCustomers(), body.audience, body.selected || []);
      if (!recipients.length) return json({ error: "Nobody matches that audience yet." }, 400);
      const result = await sendNewsletter(env, site(req), { subject, body: text, recipients });
      const id = new Date().toISOString();
      await store("campaigns").setJSON(id, { id, subject, body: text, audience: body.audience, sent: result.sent.length,
        notSent: result.notSent, recipients: result.sent });
      return json({ ok: true, ...result, sentCount: result.sent.length, leftCount: result.notSent.length });
    } catch (e) { return json({ error: e.message }, 400); }
  }
  if (route === "campaigns" && method === "GET") {
    const rows = (await readAll("campaigns")).sort((a, b) => b.id.localeCompare(a.id))
      .map(({ recipients, ...c }) => ({ ...c, notSentCount: c.notSent?.length || 0 }));
    return json({ campaigns: rows });
  }

  return json({ error: "Not found." }, 404);
};

export const config = { path: "/api/admin/*" };
