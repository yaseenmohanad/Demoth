# Demoth

T-shirt design studio built with Next.js 16. Design your own clothes.

Live: https://demoth.netlify.app

## Optional: enable AI drawing recognition

Demoth has a built-in **template-matcher** that recognises 14 simple shapes
(circle, square, heart, moon, lightning, etc.). For richer recognition —
letters, "shopping cart", "eye", "house" and so on — Demoth can also call
out to a hosted ML model. This is opt-in and entirely free.

To turn it on:

1. Sign up at <https://huggingface.co/> (free, no credit card)
2. **Settings → Access Tokens → New token** — give it the `Read` role
3. On Netlify: **Site settings → Build & deploy → Environment → Environment
   variables → Add a variable** with key `HF_TOKEN` and the token as value
4. Trigger a redeploy (Deploys → Trigger deploy)

After the redeploy, drawing on the canvas will surface up to five AI
suggestions in addition to the template matches. The free tier on
Hugging Face is ~30,000 inference requests per month — plenty for a
school project.

When `HF_TOKEN` isn't set, ML recognition silently falls back to template
matching only. Nothing else breaks.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
