// /api/img — a same-origin proxy for Wikimedia Commons images.
//
// Why this exists: index.html used to link straight to
// upload.wikimedia.org thumbnails. Hotlinking is explicitly allowed by
// Wikimedia, but in practice some ad blockers and privacy/DNS-level
// filters (uBlock lists, some router-level "family safe" filters, some
// corporate networks) flag that domain as third-party tracker-adjacent
// media and drop the request client-side — the image just silently never
// loads, with no error visible on the page itself.
//
// This route sidesteps that: the browser only ever requests an image from
// YOUR OWN domain (this function), and this function does the actual
// Wikimedia fetch server-side, where none of those client-side blockers
// apply. It also means we don't need to hand-maintain a table of MD5 hash
// prefixes for each filename anymore — Wikimedia's own Special:FilePath
// endpoint resolves the real thumbnail location for us via a redirect,
// which `fetch` follows automatically.
//
// Usage from the front-end: /api/img?file=<Commons file name>&w=<width>

export default async function handler(req, res) {
  const { file, w } = req.query || {};
  if (!file) {
    return res.status(400).send('Missing "file" query parameter.');
  }

  // Clamp width to a sane range — this is a public endpoint, so don't let
  // it be used to request arbitrarily huge (expensive) renders.
  const parsedWidth = parseInt(w, 10);
  const width = Math.min(Math.max(Number.isFinite(parsedWidth) ? parsedWidth : 1200, 50), 2000);

  const upstreamUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      redirect: 'follow',
      headers: {
        // Wikimedia's user-agent policy asks non-browser clients making
        // server-to-server requests to identify themselves and give a
        // way to reach the operator — this is that.
        'User-Agent': 'VeridelImageProxy/1.0 (static Myanmar travel-guide site; contact via GitHub repo)'
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream image fetch failed (HTTP ${upstream.status}).`);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    // A given Commons file name + width essentially never changes its
    // content, so cache it hard at both the browser and Vercel's edge.
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=2592000, immutable');
    return res.status(200).send(buf);
  } catch (err) {
    return res.status(502).send('Could not reach Wikimedia Commons.');
  }
}
