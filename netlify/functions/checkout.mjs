// POST /api/checkout
// Receives the bag from the page, prices it on the server, and returns the URL
// of a Stripe-hosted Checkout page.
//
// Environment variables (set in Netlify → Site configuration → Environment variables, never in code):
//   STRIPE_API_KEY       restricted key (rk_…) with Checkout Sessions: Write. A secret key (sk_…) also works.
//   STRIPE_TAX_ENABLED   "true" only after Stripe Tax has a head office address AND an active registration.
//   STRIPE_TAX_BEHAVIOR  "exclusive" (tax added on top, the US norm) or "inclusive". Default exclusive.
//   STRIPE_TAX_CODE      optional txcd_… product tax code; otherwise Stripe uses the preset in Tax settings.
import Stripe from "stripe";
import { expandBag, buildLineItems, freeShipping, taxConfig, packingList, orderTotal } from "../../lib/order.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const key = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Checkout isn't switched on yet." }, 503);

  let units;
  try {
    const body = await req.json();
    units = expandBag(body.items);
  } catch (err) {
    return json({ error: err.message || "Something was wrong with the bag." }, 400);
  }

  // Use the site's own address for return links (Netlify sets URL in production).
  const site = process.env.URL || new URL(req.url).origin;
  const tax = taxConfig(process.env);

  try {
    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: buildLineItems(units, site, tax),
      // Payment methods are left to Stripe (dynamic payment methods), managed in the Dashboard.
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [freeShipping(tax)],
      phone_number_collection: { enabled: true },
      ...(tax ? { automatic_tax: { enabled: true } } : {}),
      metadata: {
        sets: String(units.length),
        packing_list: packingList(units).slice(0, 500),
        expected_subtotal_cents: String(orderTotal(units)),
      },
      payment_intent_data: { description: `The MUL Collection: ${packingList(units)}`.slice(0, 500) },
      integration_identifier: "mul-hosted-checkout-qkzvbnrt",
      success_url: `${site}/?order=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/?order=cancelled`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err.type, err.code, err.message);
    return json({ error: "We couldn't open checkout. Please try again in a minute." }, 502);
  }
};

export const config = { path: "/api/checkout" };
