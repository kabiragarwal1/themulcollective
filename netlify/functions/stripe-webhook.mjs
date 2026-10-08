// POST /api/stripe-webhook
// Stripe calls this after a checkout. This is where an order becomes real — not the
// thank-you page, which a shopper might never reach (closed tab, lost signal).
//
// Environment variables:
//   STRIPE_API_KEY          same key as checkout (only used to build the client; no API calls are made here)
//   STRIPE_WEBHOOK_SECRET   signing secret (whsec_…) shown when you add the endpoint in Stripe
//
// Orders are saved in Netlify Blobs (store "orders", one entry per Checkout Session id),
// so the same event arriving twice never creates two orders.
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

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
  const orders = () => getStore("orders");

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // Card payments are paid at completion; delayed methods (e.g. bank debits) arrive
      // as "unpaid" first and are fulfilled when async_payment_succeeded follows.
      if (session.payment_status === "unpaid") return ok("awaiting payment");
      const existing = await orders().get(session.id, { type: "json" });
      if (existing && existing.status === "paid") return ok("already recorded");
      await orders().setJSON(session.id, toOrder(session, "paid", event));
      console.log(`Order paid: ${session.id} — ${session.metadata?.packing_list}`);
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

function toOrder(s, status, event) {
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
  };
}

export const config = { path: "/api/stripe-webhook" };
