# Veridel

An AI-assisted field guide to Myanmar's lightly-visited destinations — ask V where to go, browse an interactive map, and get a transparent, explainable match instead of a generic travel-blog list.

This is a static site: one `index.html` (HTML/CSS/JS, no build step) plus one optional serverless function for the AI features. No framework, no bundler.

## What's in this repo

```
.
├── index.html        the entire site
├── favicon.svg        browser tab icon
├── vercel.json        deployment config (headers, clean URLs)
├── package.json        local dev convenience only — no build step needed
├── api/
│   ├── chat.js        optional serverless proxy for the AI features (see below)
│   └── img.js         same-origin proxy for Wikimedia Commons destination photos (see below)
├── .gitignore
├── LICENSE
└── README.md
```

## Deploy it — GitHub + Vercel

**1. Push this folder to GitHub**

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

(Or just create a new repo on github.com and use its "upload files" button if you'd rather not use the command line — drag every file in this folder in, keeping the `api/` folder structure intact.)

**2. Import it into Vercel**

1. Go to [vercel.com/new](https://vercel.com/new) and sign in with your GitHub account.
2. Select the repo you just pushed.
3. Vercel will detect it as a static site automatically — no framework, no build command, no output directory needed. Leave those fields as-is.
4. Click **Deploy**. That's it — you'll get a live `*.vercel.app` URL in about a minute.

Every future `git push` to `main` will auto-redeploy.

## Important: the AI features need one extra step

Two things on this site call an AI model:
- **Ask V** search — quietly asks the AI in the background to write nicer wording for the top 3 matches your search already found (the matching itself is a local, deterministic engine and always works, with or without this).
- **The V chat bubble** — a real back-and-forth conversation.

Out of the box, right after deploying, Ask V will still work perfectly (it falls back to its own matching logic), but the AI wording polish and the chat bubble will show a "can't reach live chat right now" message until you add at least one API key below.

`api/chat.js` is a small serverless function that tries up to **4 free AI providers in order** and automatically moves to the next one if a provider is rate-limited or out of quota — so the chat keeps working even if one provider's free tier runs dry for the day. You only need to set up one of these to get started; add more for automatic fallback.

| Provider | Env var | Get a key | Notes |
|---|---|---|---|
| Groq | `GROQ_API_KEY` | [console.groq.com](https://console.groq.com/keys) | Fast, generous free rate limits, no card |
| Gemini | `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Free tier, no card |
| OpenRouter | `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) | Only `:free`-suffixed models are free — the free catalog rotates, check [openrouter.ai/models?max_price=0](https://openrouter.ai/models?max_price=0) if it ever 404s |
| Cerebras | `CEREBRAS_API_KEY` | [cloud.cerebras.ai](https://cloud.cerebras.ai/) | Free developer tier, daily token limits |

To turn them on:

1. Sign up (free, no card) with as many of the providers above as you'd like fallback coverage for, and grab an API key from each.
2. In your Vercel project: **Settings → Environment Variables** → add one entry per key (e.g. Name: `GROQ_API_KEY`, Value: your key, Environment: Production).
3. Redeploy (Vercel → Deployments → ⋯ → Redeploy, or just push a new commit).

Your keys are only ever used server-side inside `api/chat.js` — never sent to visitors' browsers. If you skip this step entirely, the site remains fully functional; it just runs on the local matching engine only, which is genuinely most of what the site does anyway.

## About the image proxy (`api/img.js`)

Destination photos come from Wikimedia Commons, but the site doesn't link to `upload.wikimedia.org` directly — it requests them from its own `/api/img` route, which fetches from Wikimedia server-side and passes the image back. This exists because some ad blockers and privacy/DNS filters silently drop direct requests to Wikimedia's media domain (treating it as third-party tracker-adjacent content), which shows up as broken-image icons even though the rest of the site works fine. Routing through your own domain avoids that — no setup needed, it works automatically on any deployment.

## Local development

No build step — you can literally just open `index.html` in a browser. For a closer-to-production local server (recommended, since the `/api/chat` route only works through a server):

```bash
npm install -g vercel
vercel dev
```

This runs the site plus the serverless function locally at `http://localhost:3000`. Add whichever provider key(s) you're using (see the table above) to a local `.env` file (or `vercel env pull`) to test the AI features locally too.

## Custom domain

Vercel → your project → **Settings → Domains** → add your domain and follow the DNS instructions shown there.

## Notes

- Destination photography is sourced from Wikimedia Commons; credit lives in the site footer.
- The map, search-matching engine, budget estimates, and "Hidden Gem Score" are all deterministic and run entirely client-side — nothing about the core experience depends on the optional AI step above.
- No analytics, tracking, or cookies are included.
