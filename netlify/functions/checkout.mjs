// POST /api/checkout
// Receives the bag from the page, prices it on the server, and returns the URL
// of a Stripe Checkout page. The secret key lives in Netlify's environment
// variables (STRIPE_SECRET_KEY), never in the page or in this repository.
import Stripe from "stripe";
import { expandBag, buildLineItems, packingList, orderTotal } from "../../lib/order.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Checkout isn't switched on yet." }, 503);

  let units;
  try {
    const body = await req.json();
    units = expandBag(body.items);
  } catch (err) {
    return json({ error: err.message || "Something was wrong with the bag." }, 400);
  }

  // Use the site's own address for the return links (Netlify sets URL in production).
  const site = process.env.URL || new URL(req.url).origin;

  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: buildLineItems(units, site),
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [{
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: 0, currency: "usd" },
          display_name: "Free US shipping",
        },
      }],
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
      metadata: {
        sets: String(units.length),
        packing_list: packingList(units).slice(0, 500),
        expected_total_cents: String(orderTotal(units)),
      },
      payment_intent_data: { description: `The MUL Collection: ${packingList(units)}`.slice(0, 500) },
      success_url: `${site}/?order=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/?order=cancelled`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err.message);
    return json({ error: "We couldn't open checkout. Please try again in a minute." }, 502);
  }
};

export const config = { path: "/api/checkout" };
