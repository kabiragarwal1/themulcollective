// POST /api/stripe-webhook
// Stripe calls this after a checkout. This is where an order becomes real — not the
// thank-you page, which a shopper might never reach (closed tab, lost signal).
//
// Environment variables:
//   STRIPE_API_KEY          same key as checkout (only used to build the client; no API calls are made here)
//   STRIPE_WEBHOOK_SECRET   signing secret (whsec_…) shown when you add the endpoint in Stripe
//   (optional) RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAIL — to email you about each new order
//
// For each paid order it:
//   1. saves the order in Netlify Blobs (store "orders", keyed by Checkout Session id, so a
//      repeated event never creates a second order),
//   2. adds or updates the buyer in "customers" (name, email, phone, address),
//   3. emails you a new-order alert, if email is set up.
import Stripe from "stripe";
import { store } from "../../lib/store.js";
import { upsertCustomer } from "../../lib/customers.js";
import { emailReady, sendOne, orderAlert } from "../../lib/email.js";

const ok = (msg = "ok") => new Response(msg, { status: 200 });
const bad = (msg, status = 400) => new Response(msg, { status });

export default async (req) => {
  if (req.method !== "POST") return bad("Use POST.", 405);

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) return bad("Webhook not configured.", 503);

  // Verify the signature on the raw body before trusting anything in it.
  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  let event;
  try {
    const stripe = new Stripe(key);
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch (err) {
    console.warn("Webhook signature check failed:", err.message);
    return bad("Invalid signature.");
  }

  const session = event.data.object;
  const orders = () => store("orders");

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // Card payments are paid at completion; delayed methods (e.g. bank debits) arrive
      // as "unpaid" first and are fulfilled when async_payment_succeeded follows.
      if (session.payment_status === "unpaid") return ok("awaiting payment");
      const existing = await orders().get(session.id, { type: "json" });
      if (existing && existing.status === "paid") return ok("already recorded");
      const order = toOrder(session, "paid", event);
      await orders().setJSON(session.id, order);
      console.log(`Order paid: ${session.id} — ${order.packing_list}`);

      if (order.email) {
        try {
          await upsertCustomer({ email: order.email, name: order.name, phone: order.phone,
            address: order.shipping_address, source: "order", orderId: order.id });
        } catch (err) { console.error("Customer save failed:", err.message); }
      }
      if (emailReady(process.env) && process.env.ADMIN_EMAIL) {
        try { await sendOne(process.env, { to: process.env.ADMIN_EMAIL, ...orderAlert(order) }); }
        catch (err) { console.error("Order alert email failed:", err.message); }
      }
      break;
    }
    case "checkout.session.async_payment_failed": {
      await orders().setJSON(session.id, toOrder(session, "payment_failed", event));
      console.log(`Payment failed: ${session.id}`);
      break;
    }
    default:
      break; // Ignore other events.
  }
  return ok();
};

export function toOrder(s, status, event) {
  const ship = s.collected_information?.shipping_details || s.shipping_details || null;
  return {
    id: s.id,
    status,
    event_id: event.id,
    created: new Date(s.created * 1000).toISOString(),
    recorded: new Date().toISOString(),
    livemode: s.livemode,
    email: s.customer_details?.email || null,
    name: ship?.name || s.customer_details?.name || null,
    phone: s.customer_details?.phone || null,
    shipping_address: ship?.address || null,
    sets: Number(s.metadata?.sets || 0),
    packing_list: s.metadata?.packing_list || "",
    amount_subtotal: s.amount_subtotal,
    amount_tax: s.total_details?.amount_tax ?? 0,
    amount_total: s.amount_total,
    currency: s.currency,
    payment_intent: s.payment_intent,
    fulfilled: false,
    shipped_at: null,
  };
}

export const config = { path: "/api/stripe-webhook" };
