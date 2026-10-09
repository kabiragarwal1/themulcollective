"""Adds SEO/AEO to public/index.html from one source of facts, so the visible FAQ and the
structured data always say the same thing. Safe to re-run: it replaces its own marked blocks."""
import json, re, html
P = "public/index.html"
SITE = "https://themulcollection.com"
s = open(P, encoding="utf-8").read()

DESC = ("A hand block-printed mul cotton travel set made in Rajasthan, India: a quilted pouch that slides over "
        "your carry-on handle, a soft mul blanket and a zip-top toiletry pouch. Machine washable. $65, or 2 sets for $120, "
        "with free US shipping.")
COLOURS = ["Scarlet Bloom", "Sage Tree", "Lemon Foliage", "Pink Jungle"]
IMAGES = ["img/og.jpg", "img/IMG_3662.jpg", "img/IMG_3666.jpg", "img/life_airport.jpg", "img/FullSizeRender.jpg",
          "img/FullSizeRender_2.jpg", "img/FullSizeRender_6.jpg"]

FAQ = [
  ("What's in The MUL Collection travel pouch set?",
   "Three pieces: a large quilted pouch with a two-button flap, a front pocket and a sleeve "
   "that slides over a trolley handle; a soft mul cotton blanket that folds into the pouch; and a zip-top toiletry pouch."),
  ("What is mul cotton?",
   "Mul, or mulmul, is a fine, featherlight cotton that Indian homes have used for generations. It's breathable, "
   "cool in the heat, a soft layer on a cold flight, and it gets softer with every wash."),
  ("Is the travel pouch set waterproof?",
   "No. The set isn't waterproof or water-resistant. Every piece is machine washable instead, so spills and travel "
   "grime wash straight out."),
  ("How do I wash it?",
   "Put it in the washing machine with the rest of your clothes, then the dryer, and it's ready for the next trip. "
   "The hand block-printed colours soften a little with every wash."),
  ("Will it fit a tablet?",
   "Yes. The main compartment of the large pouch fits a standard-size tablet, with room for snacks and a change of clothes. "
   "The front pocket suits earbuds and the things you reach for first."),
  ("How does it attach to my luggage?",
   "A quilted sleeve on the back slides over a carry-on trolley handle, so the pouch rides on your suitcase "
   "through the airport and stays within reach."),
  ("Where is it made?",
   "Every set is handmade in Rajasthan, India. Each print is stamped by hand with carved wooden blocks, then quilted "
   "and stitched by artisans, so no two sets are exactly alike. The set is GOTS (Global Organic Textile Standard) certified."),
  ("How much does it cost, and is shipping free?",
   "One set is $65 and two sets are $120, in any combination of colourways. Shipping is free to US addresses."),
  ("Which colourways are available?",
   "Four hand block-printed colourways: Scarlet Bloom, Sage Tree, Lemon Foliage and Pink Jungle."),
]

def abs_url(p): return f"{SITE}/{p}"

product = {
  "@type": "Product", "@id": f"{SITE}/#product",
  "name": "The Travel Pouch Set", "description": DESC,
  "brand": {"@type": "Brand", "name": "The MUL Collection"},
  "image": [abs_url(i) for i in IMAGES],
  "material": "Mul (mulmul) cotton, hand block-printed and quilted",
  "color": ", ".join(COLOURS),
  "countryOfOrigin": {"@type": "Country", "name": "India"},
  "category": "Travel accessories > Travel pouches",
  "offers": {
    "@type": "Offer", "url": f"{SITE}/#shop", "price": "65.00", "priceCurrency": "USD",
    "availability": "https://schema.org/InStock", "itemCondition": "https://schema.org/NewCondition",
    "seller": {"@id": f"{SITE}/#org"},
    "shippingDetails": {
      "@type": "OfferShippingDetails",
      "shippingRate": {"@type": "MonetaryAmount", "value": "0", "currency": "USD"},
      "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "US"}
    }
  }
}
graph = {"@context": "https://schema.org", "@graph": [
  {"@type": "Organization", "@id": f"{SITE}/#org", "name": "The MUL Collection", "url": SITE + "/",
   "logo": abs_url("icon-512.png"),
   "description": "Hand block-printed mul cotton travel goods, made in Rajasthan, India."},
  {"@type": "WebSite", "@id": f"{SITE}/#website", "url": SITE + "/", "name": "The MUL Collection",
   "publisher": {"@id": f"{SITE}/#org"}, "inLanguage": "en-US"},
  product,
  {"@type": "FAQPage", "@id": f"{SITE}/#faq",
   "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]},
]}

head = f'''<!-- seo:start -->
<meta name="description" content="{html.escape(DESC)}">
<link rel="canonical" href="{SITE}/">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="product">
<meta property="og:site_name" content="The MUL Collection">
<meta property="og:title" content="The Travel Pouch Set · The MUL Collection">
<meta property="og:description" content="{html.escape(DESC)}">
<meta property="og:url" content="{SITE}/">
<meta property="og:image" content="{abs_url('img/og.jpg')}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The MUL Collection travel pouch set on a carry-on handle and laid flat">
<meta property="og:locale" content="en_US">
<meta property="product:price:amount" content="65.00">
<meta property="product:price:currency" content="USD">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="The Travel Pouch Set · The MUL Collection">
<meta name="twitter:description" content="{html.escape(DESC)}">
<meta name="twitter:image" content="{abs_url('img/og.jpg')}">
<script type="application/ld+json">
{json.dumps(graph, ensure_ascii=False, indent=1)}
</script>
<!-- seo:end -->'''

# Replace any earlier block (and the old one-line description) with the fresh one.
s = re.sub(r"<!-- seo:start -->.*?<!-- seo:end -->\n?", "", s, flags=re.S)
s = re.sub(r'<meta name="description"[^>]*>\n?', "", s)
s = s.replace('<meta name="theme-color" content="#A8432F">', '<meta name="theme-color" content="#A8432F">\n' + head, 1)

faq_items = "\n".join(
  f'      <details{" open" if i == 0 else ""}>\n        <summary>{html.escape(q)}</summary>\n        <p>{html.escape(a)}</p>\n      </details>'
  for i, (q, a) in enumerate(FAQ))
section = f'''<!-- faq:start -->
<section class="faq field" id="faq" aria-labelledby="faq-title">
  <div class="wrap">
    <div class="sec-head" style="margin-bottom:0">
      <div class="trim" style="--c:var(--scarlet)"></div>
      <h2 id="faq-title">Questions, answered</h2>
      <p class="lead muted">Everything people ask before they pack it.</p>
    </div>
    <div class="acc">
{faq_items}
    </div>
  </div>
</section>
<!-- faq:end -->
'''
s = re.sub(r"<!-- faq:start -->.*?<!-- faq:end -->\n?", "", s, flags=re.S)
s = s.replace('<footer class="foot">', section + '\n<footer class="foot">', 1)

css = '''/* faq */
.faq{background:var(--paper)}
.faq .wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:clamp(24px,4vw,56px);align-items:start}
@media (max-width:820px){.faq .wrap{grid-template-columns:1fr}}
.faq .acc summary{font-size:1.02rem;gap:16px;text-align:left}
.faq .acc details > p{max-width:62ch;line-height:1.55}
'''
if "/* faq */" not in s:
    s = s.replace("/* footer: indigo", css + "/* footer: indigo", 1)

# FAQ link in the nav, mobile menu and footer
s = s.replace('<a class="l" href="#reviews">Reviews</a>\n', '<a class="l" href="#reviews">Reviews</a>\n      <a class="l" href="#faq">FAQ</a>\n', 1) if 'href="#faq">FAQ' not in s else s
s = s.replace('      <a href="#reviews">Reviews</a>\n    </nav>', '      <a href="#reviews">Reviews</a>\n      <a href="#faq">FAQ</a>\n    </nav>', 1)
s = s.replace('<a href="#reviews">Reviews</a>\n      </nav>', '<a href="#reviews">Reviews</a><a href="#faq">FAQ</a>\n      </nav>', 1)

# Lazy-load images below the first screen (everything after the shop section).
cut = s.index('<section class="craft"')
tail = re.sub(r'<img (?![^>]*loading=)', '<img loading="lazy" decoding="async" ', s[cut:])
s = s[:cut] + tail

open(P, "w", encoding="utf-8").write(s)
print("faq items:", len(FAQ), "| ld+json bytes:", len(json.dumps(graph)))
