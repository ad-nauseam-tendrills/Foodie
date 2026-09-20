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
npm run seed:all   # one-time: TheMealDB (~300 recipes) + curated American classics
npm start          # serves the app on http://localhost:3000
```

> `npm run seed` needs normal outbound internet access to
> `themealdb.com`. Run it wherever the app will actually live (your
> droplet, your own machine) — some sandboxed dev environments restrict
> outbound network access and will block it. `npm run seed:american`
> (below) needs no network at all.

## Recipe sources

- **TheMealDB** (`npm run seed`) — the main catalog, ~300 recipes, free
  and open at the point of access. Skews international/pub-style.
- **Curated cuisine sets** (`npm run seed:curated`,
  `server/data/curated/*.js`) — short, hand-picked lists filling specific
  gaps TheMealDB has: `american.js` (chicken noodle soup, meatloaf, pot
  roast, chicken and biscuits, ...), `chilean.js` (cazuela, pastel de
  choclo, empanadas de pino, porotos granados, ...), `german.js`
  (sauerbraten, schnitzel, rouladen, käsespätzle, ...). This is
  deliberately *not* a bulk import from a larger dataset (RecipeNLG,
  Food.com, etc.) — those are scraped/user-submitted collections with
  heavy near-duplicate bloat (dozens of near-identical "chicken noodle
  soup" entries differing only in, say, egg noodles vs. pasta) and
  inconsistent categorization that would undermine the category/cuisine/
  tag filters.
  - Missing a specific dish? Add it by hand to the relevant file (or a
    new one, for a cuisine that doesn't have a file yet — every `.js` in
    `server/data/curated/` is picked up automatically). Each entry
    upserts by a stable slug (its `id`), so editing an existing one and
    re-running the seed updates it in place rather than duplicating it.
- All seeds share upsert logic in `server/seed/lib.js`. `npm run
  seed:all` runs both TheMealDB and the curated sets; either can also be
  re-run alone any time to refresh/edit without touching the other.

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

## Filtering: category, cuisine, tags, and season

- **Category** narrows to a broad group (Chicken, Seafood, Dessert,
  Vegetarian, Soup, ...) -- this is what separates dessert from dinner.
- **Cuisine** (`area` in the API/database, matching TheMealDB's own field
  name) narrows to a region -- American, Chilean, German, Italian, and
  whatever else TheMealDB's international catalog and the curated set
  (below) bring in.
- **Tags** are finer-grained and freeform (Soup, Curry, Stew, ...) -- this
  is what makes "just soups" possible even though Soup isn't a category of
  its own. Existing TheMealDB recipes need a re-seed (`npm run seed`) to
  backfill tags, since that field wasn't captured before this.
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

## Meal planning + grocery list

Every recipe card (and the detail view) has an "Add to plan" button. The
plan is just a list of recipe IDs saved on the household, the same way
liked/disliked ingredients and cooked history are -- so it syncs across
every device using that household name.

The grocery list is generated fresh from the current plan on every load,
not stored separately, so it can never drift out of sync with the plan.
Ingredients are merged across recipes (two recipes both needing garlic
show up as one line, noting both), but quantities aren't summed -- "1 lb"
and "2 cups" don't have a sane way to combine automatically, so each
recipe's amount is listed rather than guessed at. Checking items off is
saved to that browser's `localStorage` only (a personal, per-device
thing while you're actually walking the store), not synced to the
household like the plan itself is.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/ingredients?q=` | Autocomplete over known ingredient names |
| `GET /api/categories` | Distinct recipe categories |
| `GET /api/areas` | Distinct cuisines/regions |
| `GET /api/tags` | Distinct recipe tags |
| `GET /api/seasonal/current` | Current season + in-season ingredients (Northeast US estimate) |
| `GET /api/recipes/match?have=a,b&exclude=c&household=name&category=&area=&tag=&seasonal=true` | Ranked recipe matches |
| `GET /api/recipes/:id` | Full recipe detail |
| `POST /api/households` | Create/fetch a household by name |
| `PUT /api/households/:name/preferences` | Save liked/disliked ingredients (permanent exclusions) |
| `POST /api/households/:name/cooked` | Log a recipe as cooked (keeps suggestions from repeating) |
| `POST /api/households/:name/plan` | Add a recipe to the meal plan |
| `DELETE /api/households/:name/plan/:recipeId` | Remove a recipe from the meal plan |
| `GET /api/households/:name/grocery-list` | Combined ingredient list for the current plan |

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
