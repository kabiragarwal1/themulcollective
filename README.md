# The MUL Collection: themulcollection.com

The shop for the hand block-printed mul cotton Travel Pouch Set.

## What's in here

| Path | What it is |
|---|---|
| `public/index.html` | The whole website: design, bag and checkout button |
| `public/img/` | Product and lifestyle photos |
| `lib/order.js` | Pricing rules: $65 for one set, $120 for two, free US shipping |
| `netlify/functions/checkout.mjs` | Server code that turns the bag into a Stripe Checkout page |
| `test/order.test.js` | Checks the pricing maths (`npm test`) |
| `netlify.toml` | Tells Netlify where the site and the function live |

## How a purchase works

1. A shopper adds sets to the bag in the browser.
2. **Checkout** sends only the colourway ids and quantities to `/api/checkout`.
3. The function prices the order on the server, so nobody can edit a price in their browser. It then asks Stripe for a checkout page.
4. Stripe takes the card and the US shipping address and emails a receipt.
5. The shopper lands back on the site with a thank-you message, and their bag is emptied.
6. You see the order in the Stripe dashboard under **Payments**. The `packing_list` field shows which colours to ship.

## One-time setup

1. **Netlify**: sign in at netlify.com with GitHub, then choose **Add new site → Import an existing project → GitHub → themulcollective**. Netlify picks up its settings from `netlify.toml`, so you just click **Deploy**.
2. **Stripe key**: in Stripe, go to **Developers → API keys** and copy the secret key. Use the test key (`sk_test_…`) first. In Netlify, go to **Site configuration → Environment variables → Add**, name it `STRIPE_SECRET_KEY`, paste the key, then redeploy. Never put this key in the code.
3. **Test an order**: use card `4242 4242 4242 4242`, any future date and any CVC. Once it works, swap in the live key (`sk_live_…`) after Stripe activates your account.
4. **Domain**: in Netlify, go to **Domain management → Add a domain → themulcollection.com**. Then, in GoDaddy DNS for themulcollection.com:
   - `A` record, host `@`, value `75.2.60.5`
   - `CNAME` record, host `www`, value `<your-site-name>.netlify.app`

   Remove any existing GoDaddy "parked" `A` record for `@`. Netlify adds HTTPS automatically once DNS has updated.

## Making changes

Edit the files, commit and push to `main`. Netlify redeploys automatically in about a minute.

## Still to do

- Inventory: stock per colourway, so a colour can sell out.
- Order emails to you, using a Stripe webhook.
- Returns policy text, and the GOTS licence number in the footer.
- Sales tax: turn on Stripe Tax if you need to collect it.
