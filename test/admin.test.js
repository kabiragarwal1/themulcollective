// End-to-end tests for orders → customers → admin → email, using an in-memory store and a
// fake Resend, so nothing real is sent. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { useMemoryStores, store } from "../lib/store.js";
import { unsubToken, makeSession, checkSession } from "../lib/auth.js";
import { pickAudience, customersCsv } from "../lib/customers.js";
import webhook from "../netlify/functions/stripe-webhook.mjs";
import subscribe from "../netlify/functions/subscribe.mjs";
import unsubscribe from "../netlify/functions/unsubscribe.mjs";
import admin from "../netlify/functions/admin.mjs";

useMemoryStores();
Object.assign(process.env, {
  STRIPE_API_KEY: "rk_test_dummy", STRIPE_WEBHOOK_SECRET: "whsec_unit", ADMIN_PASSWORD: "letmein",
  ADMIN_SECRET: "unit-secret-0123456789", URL: "https://shop.test",
  RESEND_API_KEY: "re_dummy", EMAIL_FROM: "MUL <hello@shop.test>", ADMIN_EMAIL: "owner@shop.test",
  BUSINESS_ADDRESS: "1 Test St, Testville", EMAIL_DAILY_LIMIT: "3",
});

// Fake Resend: record what would have been sent.
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith("https://api.resend.com")) {
    const body = JSON.parse(opts.body);
    (Array.isArray(body) ? body : [body]).forEach((m) => sent.push(m));
    return new Response(JSON.stringify({ id: "em_1" }), { status: 200 });
  }
  return realFetch(url, opts);
};

const post = (path, body, headers = {}) => new Request("https://shop.test" + path,
  { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
const get = (path, headers = {}) => new Request("https://shop.test" + path, { headers });

let cookie = "";
const adminPost = (route, body) => admin(post("/api/admin/" + route, body, { "x-admin": "1", cookie }));
const adminGet = (route) => admin(get("/api/admin/" + route, { cookie }));

function paidEvent(id, email, name, phone, packing = "Sage Tree × 1") {
  return { id: "evt_" + id, type: "checkout.session.completed", data: { object: {
    id, created: 1791500000, livemode: false, payment_status: "paid", currency: "usd",
    amount_subtotal: 6500, amount_total: 6500, total_details: { amount_tax: 0 }, payment_intent: "pi_" + id,
    customer_details: { email, name, phone },
    collected_information: { shipping_details: { name, address: { line1: "5 Main St", city: "Austin", state: "TX", postal_code: "78701", country: "US" } } },
    metadata: { sets: "1", packing_list: packing } } } };
}
async function deliver(event) {
  const payload = JSON.stringify(event);
  const sig = new Stripe("rk_test_dummy").webhooks.generateTestHeaderString({ payload, secret: "whsec_unit" });
  return webhook(post("/api/stripe-webhook", payload, { "stripe-signature": sig }));
}

test("a paid order is saved, the buyer becomes a customer, and you get an alert", async () => {
  const res = await deliver(paidEvent("cs_1", "Ann@Example.com", "Ann Lee", "+1 512 555 0100"));
  assert.equal(res.status, 200);
  const order = await store("orders").get("cs_1", { type: "json" });
  assert.equal(order.status, "paid");
  const c = await store("customers").get("ann@example.com", { type: "json" });
  assert.deepEqual([c.name, c.phone, c.marketing, c.orders], ["Ann Lee", "+1 512 555 0100", "none", ["cs_1"]]);
  assert.equal(sent.at(-1).to[0], "owner@shop.test");
  assert.match(sent.at(-1).subject, /New order: Sage Tree × 1/);
  // The same event again doesn't duplicate anything.
  const again = await deliver(paidEvent("cs_1", "ann@example.com", "Ann Lee", ""));
  assert.equal(await again.text(), "already recorded");
});

test("the sign-up form validates, blocks bots, and subscribes", async () => {
  assert.equal((await subscribe(post("/api/subscribe", { email: "nope", consent: true }))).status, 400);
  assert.equal((await subscribe(post("/api/subscribe", { email: "bo@example.com" }))).status, 400);
  assert.equal((await subscribe(post("/api/subscribe", { email: "bot@example.com", consent: true, website: "spam" }))).status, 200);
  assert.equal(await store("customers").get("bot@example.com", { type: "json" }), null);
  const ok = await subscribe(post("/api/subscribe", { email: "bo@example.com", name: "Bo", phone: "212-555-0199", consent: true }));
  assert.equal(ok.status, 200);
  assert.equal((await store("customers").get("bo@example.com", { type: "json" })).marketing, "subscribed");
});

test("admin needs the right password and the header", async () => {
  assert.equal((await admin(get("/api/admin/orders"))).status, 401);
  assert.equal((await admin(post("/api/admin/login", { password: "x" }))).status, 400); // no x-admin header
  assert.equal((await admin(post("/api/admin/login", { password: "wrong" }, { "x-admin": "1" }))).status, 401);
  const res = await admin(post("/api/admin/login", { password: "letmein" }, { "x-admin": "1" }));
  assert.equal(res.status, 200);
  cookie = res.headers.get("set-cookie").split(";")[0];
  assert.match(res.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);
  assert.ok(checkSession("unit-secret-0123456789", makeSession("unit-secret-0123456789")));
  assert.ok(!checkSession("unit-secret-0123456789", makeSession("other")));
});

test("admin lists orders and marks them shipped", async () => {
  const { orders } = await (await adminGet("orders")).json();
  assert.equal(orders.length, 1);
  const { order } = await (await adminPost("orders/ship", { id: "cs_1", shipped: true })).json();
  assert.equal(order.fulfilled, true);
  assert.ok(order.shipped_at);
});

test("customers list, CSV export and audiences", async () => {
  const { customers } = await (await adminGet("customers")).json();
  assert.equal(customers.length, 2);
  const csv = await (await adminGet("customers?format=csv")).text();
  assert.match(csv.split("\n")[0], /^email,name,phone,marketing,orders/);
  assert.match(csv, /ann@example.com,Ann Lee/);
  assert.equal(pickAudience(customers, "subscribers").length, 1);
  assert.equal(pickAudience(customers, "customers").length, 1);
  assert.equal(pickAudience(customers, "everyone").length, 2);
  assert.equal(pickAudience(customers, "selected", ["ANN@example.com"]).length, 1);
  assert.match(customersCsv([{ email: "x@y.com", name: "=HYPERLINK(1)" }]), /'=HYPERLINK/);
});

test("newsletter sends personal unsubscribe links and respects the daily cap", async () => {
  const before = sent.length; // the order alert already used 1 of today's 3
  const res = await adminPost("email/send", { subject: "New print", body: "Hello!\n\nIt's here.", audience: "everyone" });
  const r = await res.json();
  assert.equal(res.status, 200);
  assert.equal(r.sentCount, 2);
  const mails = sent.slice(before);
  assert.ok(mails.every((m) => m.headers["List-Unsubscribe"].includes("/api/unsubscribe?e=")));
  assert.ok(mails.every((m) => m.text.includes("1 Test St, Testville")));
  const over = await (await adminPost("email/send", { subject: "Again", body: "Hi", audience: "everyone" })).json();
  assert.equal(over.sentCount, 0);
  assert.equal(over.leftCount, 2);
});

test("unsubscribe links work only with the right token", async () => {
  const bad = await unsubscribe(get("/api/unsubscribe?e=bo@example.com&t=nope"));
  assert.equal(bad.status, 400);
  const t = unsubToken("unit-secret-0123456789", "bo@example.com");
  const ok = await unsubscribe(get(`/api/unsubscribe?e=bo@example.com&t=${t}`));
  assert.equal(ok.status, 200);
  assert.equal((await store("customers").get("bo@example.com", { type: "json" })).marketing, "unsubscribed");
  const { customers } = await (await adminGet("customers")).json();
  assert.equal(pickAudience(customers, "everyone").length, 1); // Bo is left out from now on
});
