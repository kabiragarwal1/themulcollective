// POST /api/subscribe  — the "Join the list" form on the site.
// Body: { email, name?, phone?, consent: true, website: "" }  ("website" is a hidden trap field for bots)
import { upsertCustomer, isEmail } from "../../lib/customers.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Something went wrong. Please try again." }, 400); }

  if (body.website) return json({ ok: true }); // a bot filled the hidden field: pretend it worked
  if (!isEmail(body.email)) return json({ error: "Please enter a valid email address." }, 400);
  if (body.consent !== true) return json({ error: "Please tick the box to join the list." }, 400);
  const phone = String(body.phone || "").trim();
  if (phone && !/^[+()\d\s.-]{7,20}$/.test(phone)) return json({ error: "That phone number doesn't look right." }, 400);

  await upsertCustomer({ email: body.email, name: body.name, phone, source: "signup", subscribe: true });
  return json({ ok: true });
};

export const config = { path: "/api/subscribe" };
