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
- **Households**: a shared space multiple people sign into with their
  own username + password, so "liked/disliked ingredients", the pantry,
  and "what we've cooked recently" sync across everyone's phone/laptop
  while each person keeps their own login. Accounts live in the same
  local database as everything else — no third-party auth provider.
- **Storage**: [`node:sqlite`](https://nodejs.org/api/sqlite.html), built
  into Node.js 22+. No native modules to compile, no separate database
  server to run or pay for.

## Project layout

```
server/
  index.js          Express app + API routes
  db.js             SQLite schema/connection
  services/matcher.js          Ingredient-matching search
  services/auth.js             Password hashing + sessions
  services/pantry-insights.js  "Make now" / "unlock with X" / restock suggestions
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
  - Each entry can set `imageFile` to a Wikimedia Commons filename (e.g.
    `"Chicken_noodle_soup.jpg"`, copied straight from the file's URL on
    commons.wikimedia.org) and `server/data/commons-image.js` builds a
    stable, hotlink-safe URL from it. Not every curated dish has one --
    a couple didn't have a genuinely matching free photo available, and
    it's better to leave a recipe without a picture than link a wrong
    one.
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

### Staging

`docker-compose.staging.yml` runs a second, fully isolated copy of the
app alongside production on the same droplet -- its own container
(`foodie-staging`), its own port (`3002`, vs. production's `3001`), and
its own database (`./data-staging/`, never touches production's
`./data/`). Useful any time a change is worth poking at with real
sign-ups before it reaches production, which is exactly the shape of
the accounts/pantry release: it replaces the old passwordless household
model, so existing production sessions would need to create accounts.

```bash
cd ~/foodie
git pull origin claude/dinner-recipe-app-concept-ii77im
docker compose -f docker-compose.staging.yml up -d --build
```

Front it with its own subdomain so it's reachable to actually click
through (see `deploy/nginx-site-staging.conf.example` -- same pattern as
the production vhost, pointed at port 3002 instead of 3001):

```bash
sudo cp deploy/nginx-site-staging.conf.example /etc/nginx/sites-available/foodie-staging
sudo sed -i 's/foodie-staging.edgarbustos.art/your-staging-subdomain/g' \
    /etc/nginx/sites-available/foodie-staging
sudo ln -s /etc/nginx/sites-available/foodie-staging /etc/nginx/sites-enabled/foodie-staging
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-staging-subdomain   # after pointing an A record at the droplet's IP
```

Once you've clicked through staging and you're happy, promote to
production the same way you always deploy -- pull the same commit and
rebuild the production container:

```bash
docker compose up -d --build
```

Production and staging are separate Docker volumes, so nothing you did
in staging (test accounts, test pantry data) carries over -- production
starts clean on this release the same as it would without staging at
all. Tear staging down when you're done with it:

```bash
docker compose -f docker-compose.staging.yml down
```

(add `-v` too if you also want its `./data-staging/` volume gone --
`down` alone leaves the folder on disk).

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

Saved exclusions (the "always avoid" list) are permanent once you save
them while signed in -- that's what `PUT .../preferences` below does.
They reload automatically next time you sign in, on any device.
Excluding "curry" skips curry *dishes*, not just recipes with an
ingredient literally named "curry" -- it checks the recipe's name,
category, and tags too, since a chicken curry made with turmeric and
garam masala has no ingredient called "curry" at all.

## Accounts & members

The app is meant to be reachable outside your own network, so it uses
real per-person accounts (username + password, hashed with Node's
built-in `scrypt` -- no bcrypt/argon2 native module to compile) instead
of the old passwordless "type any household name" model. Every member of
a household shares its liked/disliked ingredients, meal plan, pantry,
and cooked history, while keeping their own login. Login rate limiting
(8 attempts / 10 min per IP+household+username) is in-memory and resets
on restart -- fine for a single small instance, not something that
survives a process crash mid-attack.

**Joining a household is invite-only.** Signing up (`POST
/api/auth/signup`) only ever creates a brand-new household -- if the
name's already taken, it's rejected rather than letting you sign into
someone else's. To add someone to an *existing* household, a current
member generates an invite link from the Household members panel
("Invite someone") and sends it to them however they want -- text,
email, whatever. **The app never sends the email itself** -- there's no
outbound mail provider wired up (a deliberate choice for now: it would
mean either a third-party transactional-email account or standing up
your own SMTP, and this was low-value enough at household scale to skip
until it's actually needed). The link is just `/?invite=<token>`; opening
it shows which household you'd be joining and a plain username/password
form -- accepting it (`POST /api/auth/accept-invite`) consumes the token,
so it can't be reused. Invites expire after 7 days and can be revoked
any time before they're used, both from the same panel.

Household members can see each other on the **Household members**
panel -- cook count and top recipes per person -- by design: the point
of a shared household is that visibility, not privacy between its own
members.

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
recipe's amount is listed rather than guessed at ("1 whole for Chicken
Noodle Soup; 1/2 for Pastel de Choclo"). Checking items off is saved to
that browser's `localStorage` only (a personal, per-device thing while
you're actually walking the store), not synced to the household like
the plan itself is.

The list is grouped into rough shopping sections (Produce, Meat &
Seafood, Dairy & Eggs, ...) via `server/data/grocery-categories.js` --
another small hand-maintained keyword list, same philosophy as the
seasonal calendar and curated recipes: extend it by hand as an
ingredient lands somewhere wrong, rather than reaching for a heavier
classifier.

**Pantry inventory**: the Pantry panel tracks what a household actually
has -- ingredient, optional quantity/unit, and optional price paid +
store -- synced across devices, since it's a fact about your kitchen,
not a per-device shopping-trip thing. Click "✕ have it" on any
grocery-list item to add it untracked (no quantity, just "we have
this"); anything in the pantry (untracked, or with quantity > 0) is
excluded from every grocery list. Each item has "used it up" (removes
it, logs it as consumed) and "wasted" (removes it, logs it as thrown
out) buttons, plus a plain ✕ for "added by mistake." Marking a recipe
cooked also best-effort decrements any pantry item it uses by one unit
if you're tracking a quantity for it -- there's no structured "2 cups"
parsing to decrement precisely by, so this is an approximation, not a
real running count.

From that inventory, three panels answer the actual questions a pantry
raises, computed with the same ingredient-overlap matching as search
(no AI):
- **You can make right now** -- recipes at 100% match against your
  current pantry.
- **Add one thing, unlock a recipe** -- recipes exactly one ingredient
  away, grouped by that missing ingredient, so "buy eggs" shows
  everything it unlocks at once.
- **You keep running out of…** -- ingredients used (cooked with, or
  marked "used it up") 2+ times in the last 60 days that aren't
  currently in your pantry, with the average price and cheapest store
  you've actually logged for that ingredient. This is entirely your own
  purchase history -- there's no external price/availability API behind
  it, on purpose (no ongoing dependency, no subscription).

**Why "Carrot" and "Carrots" don't show up as two different
ingredients**: `server/data/ingredient-aliases.js` canonicalizes known
spelling variants at seed time, and `db.js` migrates any that already
split into separate rows in an existing database. It's a small
hand-maintained list (not a general singular/plural heuristic --
English food words have too many exceptions like asparagus, hummus,
and molasses for that to be safe) -- add a pair there if you spot
another one.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/ingredients?q=` | Autocomplete over known ingredient names |
| `GET /api/categories` | Distinct recipe categories |
| `GET /api/areas` | Distinct cuisines/regions |
| `GET /api/tags` | Distinct recipe tags |
| `GET /api/seasonal/current` | Current season + in-season ingredients (Northeast US estimate) |
| `GET /api/recipes/match?have=a,b&exclude=c&category=&area=&tag=&seasonal=true` | Ranked recipe matches (works signed out; de-emphasizes your own household's recently-cooked recipes if signed in) |
| `GET /api/recipes/:id` | Full recipe detail |
| `POST /api/auth/signup` | Create a *new* household + its first account (`{household, username, password}`) -- 409s if that household already exists |
| `POST /api/auth/login` | Sign in, sets the session cookie |
| `POST /api/auth/logout` | Sign out |
| `GET /api/auth/me` | Current session's username/household, or 401 |
| `GET /api/invites/:token` | Public: which household an invite link leads to, or 404/410 if invalid/expired/used |
| `POST /api/auth/accept-invite` | Join an existing household via a valid invite (`{token, username, password}`) |
| `GET /api/households/:name/invites` | List this household's invites (pending/used/expired) with their links |
| `POST /api/households/:name/invites` | Generate an invite link (`{note?}`, optional label) -- 7-day expiry, not emailed |
| `DELETE /api/households/:name/invites/:id` | Revoke an invite |
| `GET /api/households/:name` | Household state: liked/disliked/cooked log/plan (requires being signed into that household) |
| `PUT /api/households/:name/preferences` | Save liked/disliked ingredients (permanent exclusions) |
| `POST /api/households/:name/cooked` | Log a recipe as cooked -- de-dupes future suggestions, decrements matching pantry quantities |
| `POST /api/households/:name/plan` | Add a recipe to the meal plan |
| `DELETE /api/households/:name/plan/:recipeId` | Remove a recipe from the meal plan |
| `GET /api/households/:name/grocery-list` | Sectioned, pantry-filtered ingredient list for the current plan |
| `GET /api/households/:name/pantry` | List pantry items (ingredient, quantity, unit, price, store, who added it) |
| `POST /api/households/:name/pantry` | Add/restock a pantry item; a price logs a purchase event |
| `PATCH /api/households/:name/pantry/:ingredient` | Set an exact quantity, or `{action: "used_up"\|"wasted"}` |
| `DELETE /api/households/:name/pantry/:ingredient` | Remove a pantry item (no usage event -- "added by mistake") |
| `GET /api/households/:name/pantry/insights` | `{canMakeNow, unlockSuggestions}` computed from the current pantry |
| `GET /api/households/:name/pantry/restock-suggestions` | Frequently-used ingredients you're currently out of, with your own price history |
| `GET /api/households/:name/members` | Household members with cook count + top recipes |

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
- **Receipt scanning into the pantry** — photograph a receipt and have
  its line items land in pantry inventory automatically, instead of
  typing each one in. The hard part isn't OCR, it's mapping "ORG MILK
  1GAL WEGMANS" to the ingredient "Milk" — planned approach is OCR
  (likely Tesseract.js, no external API) to pull raw line items, then
  fuzzy-match each one against known ingredients and let you confirm or
  correct the match before it's added, rather than trusting a guess
  silently. Not started yet.
- **A real efficiency/waste metric** — `usage_events` already has
  everything needed (`purchased` / `consumed` / `wasted` per ingredient,
  per person, with price) to compute e.g. a household's waste rate over
  time or cost-per-meal; there's just no dashboard surfacing it yet
  beyond the raw restock suggestions.

## Attribution

Recipe data courtesy of [TheMealDB](https://www.themealdb.com/), used
under its free-tier API terms.
