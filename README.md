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
│   └── chat.js        optional serverless proxy for the AI features (see below)
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

Two things on this site call Claude:
- **Ask V** search — quietly asks Claude in the background to write nicer wording for the top 3 matches your search already found (the matching itself is a local, deterministic engine and always works, with or without this).
- **The V chat bubble** — a real back-and-forth conversation with Claude.

Both work automatically while you're editing inside Claude's own tools, because that environment authenticates the call for you. **Once deployed to Vercel, that automatic authentication doesn't exist** — so out of the box, right after deploying, Ask V will still work perfectly (it falls back to its own matching logic), but the AI wording polish and the chat bubble will show a "can't reach live chat right now" message.

To turn them on:

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/) (this requires setting up billing on your Anthropic account — API usage is pay-as-you-go, separate from any Claude subscription).
2. In your Vercel project: **Settings → Environment Variables** → add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key
   - Environment: Production (and Preview/Development if you want it there too)
3. Redeploy (Vercel → Deployments → ⋯ → Redeploy, or just push a new commit).

The `api/chat.js` file is a small serverless function that receives requests from the browser, attaches your API key server-side, and forwards them to Anthropic — your key is never exposed to visitors' browsers. If you skip this step entirely, the site remains fully functional; it just runs on the local matching engine only, which is genuinely most of what the site does anyway.

## Local development

No build step — you can literally just open `index.html` in a browser. For a closer-to-production local server (recommended, since the `/api/chat` route only works through a server):

```bash
npm install -g vercel
vercel dev
```

This runs the site plus the serverless function locally at `http://localhost:3000`. Add `ANTHROPIC_API_KEY` to a local `.env` file (or `vercel env pull`) to test the AI features locally too.

## Custom domain

Vercel → your project → **Settings → Domains** → add your domain and follow the DNS instructions shown there.

## Notes

- Destination photography is sourced from Wikimedia Commons; credit lives in the site footer.
- The map, search-matching engine, budget estimates, and "Hidden Gem Score" are all deterministic and run entirely client-side — nothing about the core experience depends on the optional AI step above.
- No analytics, tracking, or cookies are included.
