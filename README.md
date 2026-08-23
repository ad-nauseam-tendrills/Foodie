# Foodie

A self-hosted "what should we have for dinner?" app. Tell it what you like
(and what to avoid), and it matches you against a local recipe database.

**No AI/LLM calls, no third-party accounts, no monthly subscription.**
Everything — the recipe data, your preferences, your cooking history —
lives in one SQLite file on a server you control.

## How it works

- **Recipe data**: seeded once from [TheMealDB](https://www.themealdb.com/),
  a recipe database that's free and open at the point of access. After
  seeding, the app never calls out to TheMealDB again — it just reads its
  own local copy.
- **Matching**: plain ingredient filtering (no AI) — the same idea as
  SuperCook. Score every recipe by what fraction of its ingredients you
  already have, filter out anything containing an ingredient you want to
  avoid, and rank by best match.
- **Households**: a shared name (no password) your devices point at so
  "liked/disliked ingredients" and "what we've cooked recently" sync
  across everyone's phone/laptop. It's just a row in your own database —
  there's no external account system.
- **Storage**: [`node:sqlite`](https://nodejs.org/api/sqlite.html), built
  into Node.js 22+. No native modules to compile, no separate database
  server to run or pay for.

## Project layout

```
server/
  index.js          Express app + API routes
  db.js             SQLite schema/connection
  services/matcher.js   Ingredient-matching search
  seed/seed.js       One-time import from TheMealDB
public/
  index.html, app.js, styles.css   Frontend (no framework, no build step)
data/
  foodie.db          Created automatically on first run (gitignored)
```

## Running it locally

Requires Node.js **22.5+** (for built-in SQLite support).

```bash
npm install
npm run seed     # one-time: pulls ~300 recipes from TheMealDB into data/foodie.db
npm start        # serves the app on http://localhost:3000
```

> The seed script needs normal outbound internet access to
> `themealdb.com`. Run it wherever the app will actually live (your
> droplet, your own machine) — some sandboxed dev environments restrict
> outbound network access and will block it.

## Deploying to a DigitalOcean droplet

You're paying DigitalOcean for the server, not paying a monthly fee to a
recipe app — this is the whole point.

1. **Create a droplet** — cheapest tier is plenty (this app is tiny).
   Ubuntu with Docker pre-installed is the simplest image to pick.
2. **Get the code onto it**:
   ```bash
   git clone <your fork/repo url> foodie
   cd foodie
   ```
3. **Build and run**:
   ```bash
   docker compose up -d --build
   ```
4. **Seed the database** (one time, or any time you want to refresh the
   recipe list):
   ```bash
   docker compose exec foodie npm run seed
   ```
5. Visit `http://<your-droplet-ip>:3000`.

The `data/` folder is mounted as a volume, so the database survives
container restarts/upgrades. Back it up like any file — it's the entire
app's state.

### Putting it behind a domain + HTTPS (optional but recommended)

Put a reverse proxy in front of it — [Caddy](https://caddyserver.com/) is
the least fuss (automatic HTTPS from a `Caddyfile` with just your domain
name and `reverse_proxy localhost:3000`). Nginx + certbot works too if
you'd rather.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/ingredients?q=` | Autocomplete over known ingredient names |
| `GET /api/recipes/match?have=a,b&exclude=c&household=name` | Ranked recipe matches |
| `GET /api/recipes/:id` | Full recipe detail |
| `POST /api/households` | Create/fetch a household by name |
| `PUT /api/households/:name/preferences` | Save liked/disliked ingredients |
| `POST /api/households/:name/cooked` | Log a recipe as cooked (keeps suggestions from repeating) |

## Roadmap / ideas not built yet

- **Local LLM fallback** (via [Ollama](https://ollama.com/), still
  free/private/no subscription) for generating or adapting a recipe when
  there's no good match in the database — you opted to start without this,
  it's a clean addition later since matching and generation are already
  separate code paths.
- **Larger seed dataset** — swap in / merge a bigger open dataset (e.g.
  the Food.com Kaggle dataset, ~180k recipes) if TheMealDB's free ~300
  feels thin.
- **"Decision mode"** — a single "just pick one for tonight" button
  instead of a full ranked list, for when the goal is ending the debate
  fast rather than browsing.
- **Time/effort as a filter** (15-minutes/one-pan vs. a slow weekend
  meal) — often the real constraint, not just ingredients.
- **Photo-based pantry input** — snap the fridge instead of typing
  ingredients (would need a vision model — local or paid, your call when
  you get there).

## Attribution

Recipe data courtesy of [TheMealDB](https://www.themealdb.com/), used
under its free-tier API terms.
