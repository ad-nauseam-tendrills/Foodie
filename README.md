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
- **Accounts**: real per-person accounts (an email-style login identifier
  + password), each with their own liked/disliked ingredients, pantry,
  meal plan, favorites, and cooking history, synced across that one
  person's own devices. Every signed-in user can also browse any other
  user's data read-only — see "Accounts" below. Accounts live in the
  same local database as everything else — no third-party auth provider.
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
  scripts/reset-password.js   CLI password reset, no login required (npm run reset-password)
public/
  index.html, login.js   Landing page: sign in / accept invite / change password
  app.html, app.js        The actual recipe app -- pantry, search, meal plan, browse other users
  admin.html, admin.js    Admin-only: create/reset/delete accounts
  styles.css              Shared by all four pages (no framework, no build step)
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
5. **Get the initial admin password** (first boot only -- see "Accounts"
   below for what this account is for):
   ```bash
   docker compose exec foodie cat data/ADMIN_INITIAL_PASSWORD.txt
   ```
   Sign in with email `admin` and that password at `/` -- you'll be
   forced to set a new one immediately. From there, use the Admin panel
   to create your own real account (and anyone else's).
6. The container only listens on `127.0.0.1:3001` (see `docker-compose.yml`)
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
accounts before it reaches production -- e.g. the household-removal
migration, which is a one-way schema change on first boot against
whatever database it's pointed at.

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
  its own. Multiple tags can be picked at once as chips; a recipe must
  match all of them, not just one. Existing TheMealDB recipes need a
  re-seed (`npm run seed`) to backfill tags, since that field wasn't
  captured before this.
- **Seasonal** is a static, hand-curated Northeastern US harvest calendar
  (`server/data/seasonal.js`), not anything location-aware -- there's no
  free API for "what's actually in season near me" by exact location. It
  nudges the ranking toward in-season ingredients always, and the "only
  what's in season" toggle filters to just those. Edit that file directly
  if you're elsewhere or want a different region's calendar.
- **Search by name** (`q` on `/api/recipes/match`) is a plain
  case-insensitive substring match on the recipe name -- separate from
  the ingredient-overlap scoring, and the only filter that also changes
  the sort order (alphabetical, since ingredient match-percent is
  meaningless when you didn't specify any ingredients).
- **Favorites** (★ on any recipe card) are a saved-recipes list per
  account, distinct from the meal plan (temporary, clears off the
  grocery list once used) and cooked history (a log of the past) -- just
  "keep this one around," same as Paprika/Mealime/Whisk's version of the
  feature. "Favorites only" filters search to just those.
- **Sort** results by best match (default) or name (A-Z). A "Clear all
  filters" button resets every filter above at once, and the results
  count shows how many filters are currently active.

Saved exclusions (the "always avoid" list) are permanent once you save
them while signed in -- that's what `PUT .../preferences` below does.
They reload automatically next time you sign in, on any device.
Excluding "curry" skips curry *dishes*, not just recipes with an
ingredient literally named "curry" -- it checks the recipe's name,
category, and tags too, since a chicken curry made with turmeric and
garam masala has no ingredient called "curry" at all.

## Accounts

> **Upgrading an existing deployment:** the first boot after this
> release runs a one-way migration (`migrateHouseholdsToUsers` in
> `server/db.js`) that removes the household table entirely and moves
> its data onto individual accounts. A household with one member just
> flattens onto that member. A household with multiple members has no
> way to know who owned what within its shared liked/disliked/pantry/plan
> /favorites, so each former member starts with their own full copy of
> it -- nobody loses data, but members of the same former household will
> see duplicated starting state until they diverge. Usernames that
> collide once flattened into one global, cross-household email
> namespace get a numeric suffix (`bob-14`) rather than silently
> overwriting one account with another. Back up `data/foodie.db` before
> upgrading if you want a way back to the pre-migration shape.

The app is meant to be reachable outside your own network, so it uses
real per-person accounts (an email-style login identifier + password,
hashed with Node's built-in `scrypt` -- no bcrypt/argon2 native module
to compile). Every account owns its own liked/disliked ingredients,
pantry, meal plan, favorites, and cooked history -- there's no shared
"household" layer above that (an earlier version of this app had one;
it was removed because it didn't map to how people actually used the
app -- see "Cross-user visibility" below for how sharing/visibility
works instead). The login field is labeled "email" because that's what
people naturally type into it, **not because it's validated as one** --
there's no outbound mail capability in this app at all (see "Joining via
invite" below), so any non-empty, non-whitespace string works, including
the bootstrap admin's literal login of `admin`. Login rate limiting (8
attempts / 10 min per IP+email) is in-memory and resets on restart --
fine for a single small instance, not something that survives a process
crash mid-attack. Signing in, accepting an invite, and changing a
password all live on their own landing page (`/`) -- not squeezed into
the app's topbar -- and the app itself (`/app.html`) redirects there for
anything it can't handle itself, including simply not being signed in:
**there's no anonymous/browse mode.** Every page and every API route
(health check aside) requires a session; visiting `/app.html` signed out
just bounces you back to `/`.

**Self-signup is disabled.** There is no way to create an account from
the login page -- it was live for a while (back when accounts were
grouped into households) and got used to spray junk accounts at the
site, including one literally named `<img src=x onerror=alert(1)>`
(harmless here since every place user-entered text is rendered uses
`textContent`/escaped `innerHTML`, never raw HTML, but not something
worth leaving open regardless). The only ways to get an account now: an
admin creates one directly from the **Admin** panel, or an existing user
sends you an invite link. `POST /api/auth/signup` itself still exists
but always returns 403 -- kept rather than deleted so re-enabling
self-serve later, if ever wanted, is a one-line change (see git history
for the full original implementation).

**Password policy**: at least 14 characters, no other complexity rules
(no forced uppercase/digit/symbol -- length plus "not an obviously
guessable word or pattern" does more for real security than mandatory
special characters do). Rejected: the whole password as one repeated
chunk (`abcabcabc`), five or more of the same character in a row, common
words like "password"/"admin"/"qwerty"/"welcome" (see
`BANNED_WORDS` in `server/services/auth.js`), and the account's own
email (whole string, or the part before `@` and its `.`/`-`/`_`/`+`-
separated pieces -- deliberately *not* the domain, so a password isn't
rejected just for containing "com" or "gmail"). The word check is
whole-word, not substring -- "myAdministrativeAssistant2026" is fine
even though it contains "admin", since it isn't *just* "admin" with
padding. Applied identically everywhere a password is set -- signup,
accept-invite, change-password, admin-created accounts, and admin
password resets.

Any signed-in user can change their own password any time from the
account bar, and can sign out of every session at once
(`POST /api/auth/logout-all`) -- not just the current browser -- for a
lost/stolen device or "I left myself logged in somewhere." Login and
accept-invite are both rate-limited per IP (8 attempts / 10 min,
in-memory, resets on restart); expired sessions are swept from the
database hourly rather than only being cleaned up lazily when someone
tries to use one.

**The first-ever boot creates an admin account.** There's no email flow
to send setup instructions through, so on first startup (when no
`is_admin` user exists yet), the server generates one itself: login
`admin`, a random 20-character password. That password is printed to
the container logs once and saved to `data/ADMIN_INITIAL_PASSWORD.txt`
-- run `docker compose logs foodie | grep -A6 "initial admin"` or
`docker compose exec foodie cat data/ADMIN_INITIAL_PASSWORD.txt` to find
it. Signing in with it forces a password change before anything else
works -- this is enforced server-side (`requireAuth`/`requireAdmin` both
reject a `must_change_password` account with everything except the
change-password endpoint itself), not just a frontend redirect that a
direct API call could skip.

From the **Admin** panel (linked from the account bar for any admin
user), an admin can create an account directly with a temporary password
they set themselves, no invite link needed -- forced to change it on
first login, same as any admin-created account. This is the direct
alternative to the invite-link flow: useful when you'd rather hand
someone a password yourself than send them a link. An admin can also
**reset an existing user's password** the same way -- there's no
self-service "forgot password" (no email to send a reset link through),
so this is the fallback when someone's locked out. A reset invalidates
every existing session for that account, same as a stolen-password
precaution. The Admin panel's user list has a search box, since every
account on the server is listed there flat (no household grouping to
narrow it for you anymore).

**Locked out of every admin account** (the in-app reset needs an admin
session to use it, so it can't help if there isn't one)? Reset a
password directly on the server, no login required, with
`npm run reset-password`:
```bash
docker compose exec foodie npm run reset-password -- admin
```
Prints a random new password once (same style as the first-boot admin
one) and forces a password change on next login. Pass a password of
your own as a second argument instead of generating one
(`npm run reset-password -- admin 'my-own-new-password-here'`) -- it
goes through the same policy check as every other password in the app,
so a bad one gets rejected with the same message you'd see in the UI.
Either way, every existing session for that account is killed. Works
for any account, not just `admin` -- useful generally for "I forgot my
own password," not only a full lockout.

**Getting an account via invite** (`POST /api/invites`) creates a fully
independent account, same as one an admin creates directly -- there's no
household to "join" anymore, it's just the other way to get a login
besides asking an admin. Any signed-in user can generate one from the
**Invite someone** panel and send it to whoever however they want --
text, email, whatever. **The app never sends the email itself** -- there
's no outbound mail provider wired up (a deliberate choice for now: it
would mean either a third-party transactional-email account or standing
up your own SMTP, and this was low-value enough to skip until it's
actually needed). The link is just `/?invite=<token>`; opening it shows
an optional note from whoever generated it and a plain email/password
form -- accepting it (`POST /api/auth/accept-invite`) consumes the
token, so it can't be reused, and signs the new account straight in with
no forced password change (the person picked their own password, unlike
an admin-set temporary one). Invites expire after 7 days and can be
revoked any time before they're used, both from the same panel.

**Cross-user visibility is a deliberate feature, not a bug.** Any
signed-in user can read any other user's full data, read-only:
liked/disliked ingredients, meal plan, cooked history (cook count + top
recipes), and pantry -- including quantities and prices paid. The
**Browse other users** panel (with a search box over every account's
email) is the UI for this; the underlying `GET /api/users/:email/*`
routes work for any signed-in user regardless of whose data it is. It's
deliberately kept separate from your own search/plan/pantry panels above
(which always act under `/api/me/*`, bound to your own account) rather
than repurposing them, so looking at someone else's data never quietly
starts acting on their behalf. Every *write* stays restricted to your
own account -- there's no route that lets one signed-in user modify
another's data at all, by construction (every write lives under
`/api/me/*`, which always resolves to the session's own user ID, never
a parameter someone could substitute another account into).

## Meal planning + grocery list

Every recipe card (and the detail view) has an "Add to plan" button. The
plan is just a list of recipe IDs saved on your account, the same way
liked/disliked ingredients and cooked history are -- so it syncs across
every device you're signed into.

The grocery list is generated fresh from the current plan on every load,
not stored separately, so it can never drift out of sync with the plan.
Ingredients are merged across recipes (two recipes both needing garlic
show up as one line, noting both), but quantities aren't summed -- "1 lb"
and "2 cups" don't have a sane way to combine automatically, so each
recipe's amount is listed rather than guessed at ("1 whole for Chicken
Noodle Soup; 1/2 for Pastel de Choclo"). Checking items off is saved to
that browser's `localStorage` only (a personal, per-device thing while
you're actually walking the store), not synced to your account like
the plan itself is.

The list is grouped into rough shopping sections (Produce, Meat &
Seafood, Dairy & Eggs, ...) via `server/data/grocery-categories.js` --
another small hand-maintained keyword list, same philosophy as the
seasonal calendar and curated recipes: extend it by hand as an
ingredient lands somewhere wrong, rather than reaching for a heavier
classifier.

**Pantry inventory**: the Pantry panel tracks what you actually have --
ingredient, optional quantity/unit, and optional price paid + store --
synced across your own devices, since it's a fact about your kitchen,
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
| `GET /api/ingredients?q=` | Autocomplete over known ingredient names -- requires sign-in |
| `GET /api/categories` | Distinct recipe categories -- requires sign-in |
| `GET /api/areas` | Distinct cuisines/regions -- requires sign-in |
| `GET /api/tags` | Distinct recipe tags -- requires sign-in |
| `GET /api/seasonal/current` | Current season + in-season ingredients (Northeast US estimate) -- requires sign-in |
| `GET /api/recipes/match?have=a,b&exclude=c&category=&area=&tag=a,b&seasonal=true&q=&favoritesOnly=true&email=` | Ranked recipe matches -- requires sign-in. `q` searches by name; `tag` accepts multiple comma-separated tags, AND'd together; `email` scopes favorites/`isFavorite` to that account (always your own, even while browsing another read-only); de-emphasizes your own recently-cooked recipes |
| `GET /api/recipes/:id` | Full recipe detail -- requires sign-in |
| `POST /api/auth/signup` | **Disabled** -- always 403s. Left in place rather than deleted; see "Self-signup is disabled" above |
| `POST /api/auth/login` | Sign in (`{email, password}`), sets the session cookie |
| `POST /api/auth/logout` | Sign out (current session only) |
| `POST /api/auth/logout-all` | Sign out of every session for this account, everywhere |
| `GET /api/auth/me` | Current session's email/isAdmin/mustChangePassword, or 401 |
| `POST /api/auth/change-password` | `{currentPassword, newPassword}` -- works even when must-change-password is set (that's the only thing such an account can do) |
| `GET /api/invites/:token` | Public: an invite's note + expiry, or 404/410 if invalid/expired/used |
| `POST /api/auth/accept-invite` | Create a new, independent account via a valid invite (`{token, email, password}`) -- signs straight in, no forced password change |
| `GET /api/invites` | List invites you've created (pending/used/expired) with their links |
| `POST /api/invites` | Generate an invite link (`{note?}`, optional label) -- 7-day expiry, not emailed |
| `DELETE /api/invites/:id` | Revoke an invite you created |
| `GET /api/users` | List every account (email + cook count) -- any signed-in user, powers the browse-other-users panel |
| `GET /api/users/:email` | Another account's state: liked/disliked/cooked log (+ cook count/top recipes)/plan/favorites -- readable by any signed-in user |
| `GET /api/users/:email/pantry` | Another account's pantry items -- readable by any signed-in user |
| `GET /api/users/:email/pantry/insights` | Another account's `{canMakeNow, unlockSuggestions}` -- readable by any signed-in user |
| `GET /api/users/:email/pantry/restock-suggestions` | Another account's restock suggestions -- readable by any signed-in user |
| `GET /api/users/:email/grocery-list` | Another account's sectioned grocery list -- readable by any signed-in user |
| `GET /api/me` | Your own state: liked/disliked/cooked log/plan/favorites |
| `PUT /api/me/preferences` | Save your own liked/disliked ingredients |
| `POST /api/me/cooked` | Log a recipe as cooked -- de-dupes future suggestions, decrements matching pantry quantities |
| `POST /api/me/plan` | Add a recipe to your meal plan |
| `DELETE /api/me/plan/:recipeId` | Remove a recipe from your meal plan |
| `POST /api/me/favorites` | Save a recipe as a favorite |
| `DELETE /api/me/favorites/:recipeId` | Remove a favorite |
| `GET /api/me/grocery-list` | Sectioned, pantry-filtered ingredient list for your current plan |
| `GET /api/me/pantry` | List your own pantry items (ingredient, quantity, unit, price, store) |
| `POST /api/me/pantry` | Add/restock a pantry item; a price logs a purchase event |
| `PATCH /api/me/pantry/:ingredient` | Set an exact quantity, or `{action: "used_up"\|"wasted"}` |
| `DELETE /api/me/pantry/:ingredient` | Remove a pantry item -- no usage event, "added by mistake" |
| `GET /api/me/pantry/insights` | `{canMakeNow, unlockSuggestions}` computed from your pantry |
| `GET /api/me/pantry/restock-suggestions` | Frequently-used ingredients you're out of, with your own price history |
| `GET /api/admin/users` | Admin only: every account on the server |
| `POST /api/admin/users` | Admin only: create a user directly (`{email, password, isAdmin?}`) -- always must-change-password |
| `POST /api/admin/users/:id/reset-password` | Admin only: set a new temporary password for an existing user (`{password}`) -- forces must-change-password, kills their existing sessions |
| `DELETE /api/admin/users/:id` | Admin only: delete a user (not yourself) |

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
  per account, with price) to compute e.g. a waste rate over time or
  cost-per-meal; there's just no dashboard surfacing it yet beyond the
  raw restock suggestions.

## Attribution

Recipe data courtesy of [TheMealDB](https://www.themealdb.com/), used
under its free-tier API terms.
