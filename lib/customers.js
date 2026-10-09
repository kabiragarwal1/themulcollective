// Customers: one record per email address, built from orders and from the site's sign-up form.
//
// Record shape:
//   { email, name, phone, address, sources: ["order","signup"], orders: [sessionIds],
//     marketing: "subscribed" | "unsubscribed" | "none", created, updated }
//
// "marketing" decides who receives newsletters. Buyers start as "none" (they get order emails,
// not newsletters) unless they've also joined the list. Anyone can unsubscribe at any time.
import { store, readAll } from "./store.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normEmail = (e) => String(e || "").trim().toLowerCase();
export const isEmail = (e) => EMAIL_RE.test(normEmail(e)) && normEmail(e).length <= 254;
const clean = (v, max = 120) => (v == null ? "" : String(v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max));

export async function getCustomer(email) {
  return store("customers").get(normEmail(email), { type: "json" });
}

export async function upsertCustomer(input) {
  const email = normEmail(input.email);
  if (!isEmail(email)) throw new Error("Please enter a valid email address.");
  const now = new Date().toISOString();
  const prev = (await getCustomer(email)) || {
    email, name: "", phone: "", address: null, sources: [], orders: [], marketing: "none", created: now,
  };
  const next = { ...prev, updated: now };
  if (input.name) next.name = clean(input.name);
  if (input.phone) next.phone = clean(input.phone, 40);
  if (input.address) next.address = input.address;
  if (input.source && !next.sources.includes(input.source)) next.sources = [...next.sources, input.source];
  if (input.orderId && !next.orders.includes(input.orderId)) next.orders = [...next.orders, input.orderId];
  // Opting in only ever comes from the person themselves, by submitting the sign-up form.
  if (input.subscribe === true) next.marketing = "subscribed";
  await store("customers").setJSON(email, next);
  return next;
}

export async function setMarketing(email, status) {
  const c = await getCustomer(email);
  if (!c) return null;
  c.marketing = status;
  c.updated = new Date().toISOString();
  await store("customers").setJSON(c.email, c);
  return c;
}

export async function listCustomers() {
  const rows = await readAll("customers");
  return rows.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
}

// Who an email goes to. Unsubscribed people are always left out.
//   subscribers → joined the list;  customers → anyone who has bought;
//   everyone → both;                selected → the exact addresses picked in the admin.
export function pickAudience(customers, audience, selected = []) {
  const pick = new Set(selected.map(normEmail));
  return customers.filter((c) => {
    if (c.marketing === "unsubscribed") return false;
    if (audience === "subscribers") return c.marketing === "subscribed";
    if (audience === "customers") return c.orders?.length > 0;
    if (audience === "everyone") return c.marketing === "subscribed" || c.orders?.length > 0;
    if (audience === "selected") return pick.has(c.email);
    return false;
  });
}

const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function customersCsv(customers) {
  const head = ["email", "name", "phone", "marketing", "orders", "sources", "city", "state", "country", "created", "updated"];
  const lines = customers.map((c) => [
    c.email, c.name, c.phone, c.marketing, c.orders?.length || 0, (c.sources || []).join("|"),
    c.address?.city, c.address?.state, c.address?.country, c.created, c.updated,
  ].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}
