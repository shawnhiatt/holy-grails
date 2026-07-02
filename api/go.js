// Outbound Discogs redirector — server-side 302.
// A client-side redirect (the old public/go.html) still triggered the
// Discogs app's iOS Universal Link: the in-app browser treats a JS
// location.replace() as a fresh navigation and app-switches, stranding the
// overlay on the intermediate page. iOS only evaluates Universal Links
// against the URL the user tapped — server redirects don't re-trigger the
// check — so the hop to discogs.com happens here instead.
export default function handler(req, res) {
  const u = req.query?.u;
  const target =
    typeof u === "string" && u.startsWith("https://www.discogs.com/")
      ? u
      : "/";
  res.statusCode = 302;
  res.setHeader("Location", target);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}
