// The webhook must refuse anything that isn't signed by Stripe.
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/stripe-webhook.mjs";

const post = (body, headers = {}) =>
  new Request("https://example.test/api/stripe-webhook", { method: "POST", body, headers });

test("returns 503 when the webhook secret isn't set", async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const res = await handler(post("{}"));
  assert.equal(res.status, 503);
});

test("rejects a request with a bad signature", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_dummy";
  process.env.STRIPE_API_KEY = "rk_test_dummy";
  const res = await handler(post('{"type":"checkout.session.completed"}', { "stripe-signature": "t=1,v1=bad" }));
  assert.equal(res.status, 400);
});
