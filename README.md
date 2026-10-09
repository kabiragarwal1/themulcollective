# The MUL Collection: themulcollection.com

The shop for the hand block-printed mul cotton Travel Pouch Set.

## What's in here

| Path | What it is |
|---|---|
| `public/index.html` | The whole website: design, bag and checkout button |
| `public/img/` | Product and lifestyle photos |
| `lib/order.js` | Pricing rules: $65 for one set, $120 for two, free US shipping |
| `netlify/functions/checkout.mjs` | Server code that turns the bag into a Stripe-hosted Checkout page |
| `netlify/functions/stripe-webhook.mjs` | Receives Stripe's signed "payment done" events and saves each order |
| `scripts/check-keys.sh` | Pre-commit check that blocks Stripe keys from being committed |
| `public/admin/` | The admin page: orders, customers, email |
| `netlify/functions/admin.mjs` | Admin API (password login, orders, customers, CSV, email) |
| `netlify/functions/subscribe.mjs`, `unsubscribe.mjs` | The site's "Join the list" form and the unsubscribe link in emails |
| `lib/customers.js`, `lib/email.js`, `lib/auth.js`, `lib/store.js` | Customer records, Resend email, signing, and storage (Netlify Blobs) |
| `scripts/seo_build.py` | Writes the FAQ, meta tags and structured data from one list of facts |
| `test/order.test.js` | Checks the pricing maths (`npm test`) |
| `netlify.toml` | Tells Netlify where the site and the function live |

## How a purchase works

1. A shopper adds sets to the bag in the browser.
2. **Checkout** sends only the colourway ids and quantities to `/api/checkout`.
3. The function prices the order on the server, so nobody can edit a price in their browser. It then asks Stripe for a checkout page.
4. Stripe takes the card and the US shipping address and emails a receipt.
5. Stripe calls `/api/stripe-webhook`. The function checks Stripe's signature and saves the order (customer, address, colours, amounts) in Netlify Blobs under `orders`. This is the real record of the order. The thank-you page is not, because a shopper might close the tab before it loads.
6. The shopper lands back on the site with a thank-you message, and their bag is emptied.
7. You also see the order in the Stripe dashboard under **Payments**. The `packing_list` field shows which colours to ship.

## Environment variables (Netlify → Site configuration → Environment variables)

| Name | Value | When |
|---|---|---|
| `STRIPE_API_KEY` | Restricted key `rk_test_…`, later `rk_live_…`, with **Checkout Sessions: Write** | Now |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the webhook endpoint you add in Stripe | Now |
| `STRIPE_TAX_ENABLED` | `true` | Only once Stripe Tax has a head office address and an active registration |
| `STRIPE_TAX_BEHAVIOR` | `exclusive` (tax added on top of $65) or `inclusive` | With tax |
| `STRIPE_TAX_CODE` | A `txcd_…` code, or leave unset to use the preset in Stripe Tax settings | With tax |

| `ADMIN_PASSWORD` | The password for /admin | Now |
| `ADMIN_SECRET` | A long random string (40+ characters) that signs logins and unsubscribe links | Now |
| `RESEND_API_KEY` | `re_…` from resend.com | When email is set up |
| `EMAIL_FROM` | `The MUL Collection <hello@themulcollection.com>` (domain verified in Resend) | When email is set up |
| `EMAIL_REPLY_TO` | Where replies go (optional) | When email is set up |
| `ADMIN_EMAIL` | Where new-order alerts and test emails go | When email is set up |
| `BUSINESS_ADDRESS` | Postal address printed in newsletters (US CAN-SPAM requires one) | Before the first newsletter |

Keys never go in the code. The pre-commit hook blocks them.

## The admin (themulcollection.com/admin)

- **Orders**: every paid order with name, email, phone, address and colours. Tick *Shipped* when it's posted.
- **Customers**: everyone who bought or joined the list, with search, filters and *Download CSV*. Tick people to email just them.
- **Email**: write a message, preview it, send yourself a test, then send to the list, buyers, both, or the people you ticked. Every email has its own unsubscribe link. The free Resend plan allows 100 emails a day; anyone over that stays ticked for the next day.

Who gets newsletters: people who joined via the site's form. Buyers are listed too, and can be emailed with *Everyone who has bought*. Anyone who unsubscribes is always left out.

## One-time setup

1. **Netlify**: import this repo (**Add new site → Import from GitHub → themulcollective**). Every push to `main` then redeploys.
2. **Restricted key**: in Stripe go to **Developers → API keys → Create restricted key**, name it `netlify-checkout` and set **Checkout Sessions** to **Write** (everything else None). Paste it into Netlify as `STRIPE_API_KEY`.
3. **Webhook**: in Stripe go to **Developers → Webhooks → Add endpoint**. The URL is `https://themulcollection.com/api/stripe-webhook`. Add these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`. Copy the signing secret into Netlify as `STRIPE_WEBHOOK_SECRET`, then redeploy.
4. **Test**: buy with card `4242 4242 4242 4242`. In Stripe, the webhook should show a `200` response.
5. **Domain** (GoDaddy DNS for themulcollection.com): set an `A` record for `@` to `75.2.60.5` and a `CNAME` for `www` to `<your-site>.netlify.app`. Delete GoDaddy's parked `@` record. Then add the domain in Netlify under **Domain management**.
6. **Stripe Tax** (talk to a tax advisor about where you have to collect):
   - Set the head office address under **Tax → Settings**, and pick a preset tax code there. Candidates are `txcd_99999999` (General - Tangible Goods), `txcd_30060015` (Luggage) and `txcd_30060010` (Non-Clothing Accessories); see the [tax code list](https://docs.stripe.com/tax/tax-codes).
   - Add a registration under **Tax → Locations** for each state where you're registered.
   - Only then set `STRIPE_TAX_ENABLED=true`. With tax on but no registration, Stripe collects $0 and shows no error.
7. **Going live**: activate the Stripe account, create the live restricted key and live webhook, and swap both values in Netlify. Live registrations must be added again: sandbox ones don't carry over.

## Making changes

Edit the files, commit and push to `main`. Netlify redeploys automatically in about a minute.

## Still to do

- Inventory: stock per colourway, so a colour can sell out.
- Order notification emails (for now, turn on Stripe's **successful payment** emails under Settings → Notifications, and customer receipts under Settings → Emails).
- A small admin page listing orders from the `orders` store, with a "shipped" button.
- Returns policy text, and the GOTS licence number in the footer.
