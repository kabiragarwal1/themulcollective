// Runs by itself after every successful Netlify deploy (the file name is the trigger).
// It tells Bing, Yandex and other IndexNow search engines that the site's pages changed,
// so Copilot and Bing answers pick up new prices, FAQs and pages within hours instead of weeks.
// The key below is public by design: IndexNow checks it against public/0826def56ad1d1f613997cd684c34dcc.txt.
const KEY = "0826def56ad1d1f613997cd684c34dcc";
const HOST = "themulcollection.com";
const URLS = ["/", "/privacy/", "/llms.txt", "/sitemap.xml"];

export const handler = async (event) => {
  try {
    const deploy = JSON.parse(event.body || "{}").payload || {};
    if (deploy.context && deploy.context !== "production") return { statusCode: 200, body: "skipped: not production" };
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList: URLS.map((u) => `https://${HOST}${u}`),
      }),
    });
    console.log("IndexNow ping:", res.status);
  } catch (e) {
    console.log("IndexNow ping failed (the deploy is fine):", e.message);
  }
  return { statusCode: 200, body: "ok" };
};
