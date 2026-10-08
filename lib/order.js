// Pricing rules for The MUL Collection, kept on the server so nobody can change
// a price from their browser. The page only sends colourway ids and quantities.

export const CURRENCY = "usd";
export const SINGLE_PRICE = 6500; // cents: one set is $65
export const PAIR_PRICE = 12000;  // cents: two sets are $120, any colourways
export const MAX_SETS = 20;       // per order

// id (as used on the page) -> name and photo shown on the Stripe checkout page
export const COLOURWAYS = {
  scarlet: { name: "Scarlet Bloom", image: "img/IMG_3666.jpg" },
  sage:    { name: "Sage Tree",     image: "img/FullSizeRender.jpg" },
  lemon:   { name: "Lemon Foliage", image: "img/FullSizeRender_2.jpg" },
  pink:    { name: "Pink Jungle",   image: "img/FullSizeRender_6.jpg" },
};

// Turn the bag into one entry per set, e.g. ["scarlet", "scarlet", "sage"].
export function expandBag(items) {
  if (!Array.isArray(items)) throw new Error("Your bag is empty.");
  const units = [];
  for (const line of items) {
    if (!line || !COLOURWAYS[line.id]) continue;
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty < 1) continue;
    for (let i = 0; i < qty; i++) units.push(line.id);
  }
  if (units.length === 0) throw new Error("Your bag is empty.");
  if (units.length > MAX_SETS) throw new Error(`Orders are limited to ${MAX_SETS} sets. Email us for bigger orders.`);
  return units;
}

// Build Stripe line items: every two sets become one "2 sets" line at $120,
// and an odd set left over is a single line at $65.
// `tax` is null when Stripe Tax is off, or { behavior, code } when it's on:
//   behavior "exclusive" adds tax on top of $65/$120; "inclusive" means the price already includes it.
//   code is the product tax code (txcd_…); leave it empty to use the preset code in Stripe Tax settings.
export function buildLineItems(units, siteUrl, tax = null) {
  const groups = new Map();
  const line = ({ key, amount, name, description, imageId, colourways }) => {
    const g = groups.get(key);
    if (g) { g.quantity++; return; }
    const product_data = {
      name,
      description,
      metadata: { colourways },
      ...(siteUrl ? { images: [new URL(COLOURWAYS[imageId].image, siteUrl).href] } : {}),
      ...(tax && tax.code ? { tax_code: tax.code } : {}),
    };
    groups.set(key, {
      price_data: {
        currency: CURRENCY,
        unit_amount: amount,
        product_data,
        ...(tax ? { tax_behavior: tax.behavior } : {}),
      },
      quantity: 1,
    });
  };
  for (let i = 0; i + 1 < units.length; i += 2) {
    const pair = [units[i], units[i + 1]].sort();
    const names = pair.map((id) => COLOURWAYS[id].name);
    const label = names[0] === names[1] ? `2 × ${names[0]}` : `${names[0]} + ${names[1]}`;
    line({
      key: "pair:" + pair.join("+"), amount: PAIR_PRICE,
      name: "The Travel Pouch Set, 2 sets",
      description: `${label}. Each set: quilted pouch, mul blanket, toiletry pouch.`,
      imageId: pair[0], colourways: pair.join(","),
    });
  }
  if (units.length % 2 === 1) {
    const id = units[units.length - 1];
    line({
      key: "single:" + id, amount: SINGLE_PRICE,
      name: "The Travel Pouch Set",
      description: `${COLOURWAYS[id].name}. Quilted pouch, mul blanket, toiletry pouch.`,
      imageId: id, colourways: id,
    });
  }
  return [...groups.values()];
}

// Free US shipping as a Checkout shipping option. With Stripe Tax on it also needs a tax behaviour.
export function freeShipping(tax = null) {
  return {
    shipping_rate_data: {
      type: "fixed_amount",
      fixed_amount: { amount: 0, currency: CURRENCY },
      display_name: "Free US shipping",
      ...(tax ? { tax_behavior: tax.behavior } : {}),
    },
  };
}

// Read the tax switch from environment variables (set in Netlify, not in code).
export function taxConfig(env) {
  if (env.STRIPE_TAX_ENABLED !== "true") return null;
  const behavior = env.STRIPE_TAX_BEHAVIOR === "inclusive" ? "inclusive" : "exclusive";
  const code = /^txcd_\d{8}$/.test(env.STRIPE_TAX_CODE || "") ? env.STRIPE_TAX_CODE : undefined;
  return { behavior, code };
}

export function orderTotal(units) {
  const n = units.length;
  return Math.floor(n / 2) * PAIR_PRICE + (n % 2) * SINGLE_PRICE;
}

// "Scarlet Bloom × 2, Sage Tree × 1" for the order record your team packs from.
export function packingList(units) {
  const counts = {};
  for (const id of units) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts).map(([id, n]) => `${COLOURWAYS[id].name} × ${n}`).join(", ");
}
