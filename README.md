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
5. The container only listens on `127.0.0.1:3001` (see `docker-compose.yml`)
   — it's not reachable from outside the droplet on its own. That's
   deliberate: put a reverse proxy in front of it (next section), the
   same way you would for any other app sharing the box.

The `data/` folder is mounted as a volume, so the database survives
container restarts/upgrades. Back it up like any file — it's the entire
app's state.

### Putting it behind a domain + HTTPS

If nginx is already fronting other apps on this droplet, add Foodie as
one more site rather than reaching for a second reverse proxy:

```bash
sudo cp deploy/nginx-site.conf.example /etc/nginx/sites-available/foodie
sudo sed -i 's/foodie.edgarbustos.art/your-domain-here/g' /etc/nginx/sites-available/foodie
sudo ln -s /etc/nginx/sites-available/foodie /etc/nginx/sites-enabled/foodie
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain-here   # provisions TLS, rewrites the file with a 443 block
```

Starting fresh with nothing else on the box? [Caddy](https://caddyserver.com/)
is less setup (automatic HTTPS from a `Caddyfile` with just your domain
name and `reverse_proxy localhost:3001`).

Either way, point an A record for your domain at the droplet's IP first.

## Filtering: category, tags, and season

- **Category** narrows to a broad group TheMealDB assigns (Chicken, Seafood,
  Dessert, Vegetarian, ...) -- this is what separates dessert from dinner.
- **Tags** are finer-grained and freeform (Soup, Curry, Stew, ...) -- this
  is what makes "just soups" possible even though Soup isn't a category of
  its own. Existing recipes need a re-seed (`npm run seed`) to backfill
  tags, since TheMealDB's tag field wasn't captured before this.
- **Seasonal** is a static, hand-curated Northeastern US harvest calendar
  (`server/data/seasonal.js`), not anything location-aware -- there's no
  free API for "what's actually in season near me" by exact location. It
  nudges the ranking toward in-season ingredients always, and the "only
  what's in season" toggle filters to just those. Edit that file directly
  if you're elsewhere or want a different region's calendar.

Saved exclusions (the "always avoid" list) are already permanent once you
save them to a household -- that's what `PUT .../preferences` below does.
They reload automatically next time that household name is used, on any
device.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/ingredients?q=` | Autocomplete over known ingredient names |
| `GET /api/categories` | Distinct recipe categories |
| `GET /api/tags` | Distinct recipe tags |
| `GET /api/seasonal/current` | Current season + in-season ingredients (Northeast US estimate) |
| `GET /api/recipes/match?have=a,b&exclude=c&household=name&category=&tag=&seasonal=true` | Ranked recipe matches |
| `GET /api/recipes/:id` | Full recipe detail |
| `POST /api/households` | Create/fetch a household by name |
| `PUT /api/households/:name/preferences` | Save liked/disliked ingredients (permanent exclusions) |
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
