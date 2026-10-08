// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { expandBag, buildLineItems, orderTotal, packingList } from "../lib/order.js";

const total = (items) => items.reduce((s, i) => s + i.price_data.unit_amount * i.quantity, 0);

test("one set is $65", () => {
  const u = expandBag([{ id: "scarlet", qty: 1 }]);
  assert.equal(orderTotal(u), 6500);
  assert.equal(total(buildLineItems(u)), 6500);
});

test("two sets in any colours are $120", () => {
  const u = expandBag([{ id: "scarlet", qty: 1 }, { id: "sage", qty: 1 }]);
  const items = buildLineItems(u);
  assert.equal(items.length, 1);
  assert.equal(total(items), 12000);
  assert.match(items[0].price_data.product_data.description, /Sage Tree \+ Scarlet Bloom/);
});

test("three sets are $120 + $65", () => {
  const u = expandBag([{ id: "scarlet", qty: 2 }, { id: "lemon", qty: 1 }]);
  assert.equal(total(buildLineItems(u)), 18500);
  assert.equal(packingList(u), "Scarlet Bloom × 2, Lemon Foliage × 1");
});

test("four of the same colour group into one line", () => {
  const items = buildLineItems(expandBag([{ id: "pink", qty: 4 }]));
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 2);
  assert.equal(total(items), 24000);
});

test("prices sent from the browser are ignored and bad input is rejected", () => {
  const u = expandBag([{ id: "sage", qty: 1, price: 1 }, { id: "fake", qty: 3 }, { id: "lemon", qty: -2 }]);
  assert.deepEqual(u, ["sage"]);
  assert.throws(() => expandBag([]), /empty/);
  assert.throws(() => expandBag([{ id: "sage", qty: 50 }]), /limited/);
});

test("photos use the site's address", () => {
  const items = buildLineItems(expandBag([{ id: "sage", qty: 1 }]), "https://themulcollection.com");
  assert.equal(items[0].price_data.product_data.images[0], "https://themulcollection.com/img/FullSizeRender.jpg");
});

import { freeShipping, taxConfig } from "../lib/order.js";

test("tax stays off unless switched on", () => {
  assert.equal(taxConfig({}), null);
  assert.equal(taxConfig({ STRIPE_TAX_ENABLED: "yes" }), null);
  const items = buildLineItems(expandBag([{ id: "sage", qty: 1 }]), null, taxConfig({}));
  assert.equal(items[0].price_data.tax_behavior, undefined);
  assert.equal(freeShipping(null).shipping_rate_data.tax_behavior, undefined);
});

test("tax switched on adds a tax behaviour and an optional valid tax code", () => {
  const tax = taxConfig({ STRIPE_TAX_ENABLED: "true", STRIPE_TAX_CODE: "txcd_99999999" });
  assert.deepEqual(tax, { behavior: "exclusive", code: "txcd_99999999" });
  const items = buildLineItems(expandBag([{ id: "sage", qty: 2 }]), null, tax);
  assert.equal(items[0].price_data.tax_behavior, "exclusive");
  assert.equal(items[0].price_data.product_data.tax_code, "txcd_99999999");
  assert.equal(freeShipping(tax).shipping_rate_data.tax_behavior, "exclusive");
  assert.equal(taxConfig({ STRIPE_TAX_ENABLED: "true", STRIPE_TAX_CODE: "nonsense" }).code, undefined);
  assert.equal(taxConfig({ STRIPE_TAX_ENABLED: "true", STRIPE_TAX_BEHAVIOR: "inclusive" }).behavior, "inclusive");
});
