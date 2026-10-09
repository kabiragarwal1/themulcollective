// GET or POST /api/unsubscribe?e=<email>&t=<token>
// The link at the bottom of every newsletter. The token proves the link came from us,
// so nobody can unsubscribe someone else. POST supports one-click unsubscribe in Gmail/Apple Mail.
import { checkUnsub } from "../../lib/auth.js";
import { setMarketing, normEmail } from "../../lib/customers.js";

const page = (title, msg, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · The MUL Collection</title></head>
<body style="margin:0;background:#F8F3EA;color:#2A2320;font-family:Helvetica,Arial,sans-serif">
<main style="max-width:520px;margin:12vh auto;padding:0 24px">
<p style="letter-spacing:.16em;text-transform:uppercase;font-size:13px">The <b>MUL</b> Collection</p>
<h1 style="font-family:Georgia,serif;font-size:32px;margin:12px 0">${title}</h1>
<p style="line-height:1.6">${msg}</p>
<p><a href="/" style="color:#A8432F">Back to the shop</a></p></main></body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8" } });

export default async (req) => {
  const url = new URL(req.url);
  const email = normEmail(url.searchParams.get("e"));
  const token = url.searchParams.get("t");
  if (!checkUnsub(process.env.ADMIN_SECRET, email, token)) {
    return page("Link not recognised", "This unsubscribe link isn't valid. Reply to any of our emails and we'll take you off the list.", 400);
  }
  await setMarketing(email, "unsubscribed");
  if (req.method === "POST") return new Response("ok");
  return page("You're unsubscribed", "You won't get any more newsletters from us. Order emails for anything you buy will still arrive.");
};

export const config = { path: "/api/unsubscribe" };
