'use strict';

const express = require('express');
const path = require('node:path');
const db = require('./db');
const { matchRecipes } = require('./services/matcher');
const { getCurrentSeason, keywordsForSeason } = require('./data/seasonal');
const { groceryCategoryFor, SECTION_ORDER } = require('./data/grocery-categories');
const { canonicalizeIngredientName } = require('./data/ingredient-aliases');
const { getOrCreateIngredientId } = require('./seed/lib');
const {
  hashPassword,
  verifyPassword,
  createToken,
  tokenExpiryIso,
  inviteExpiryIso,
  validatePassword,
  isLoginRateLimited,
  recordLoginAttempt,
  SESSION_TTL_MS,
} = require('./services/auth');
const { pantryInsights, restockSuggestions, pantryIngredientNames } = require('./services/pantry-insights');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_COOKIE = 'foodie_session';

// Needed so req.secure / req.ip reflect the real client, not the nginx
// hop in front of this container -- otherwise session cookies would never
// get the Secure flag and rate limiting would key off one shared IP.
app.set('trust proxy', 1);

app.use(express.json());
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    // Without this, browsers can keep serving a cached app.js/styles.css
    // after a deploy until the user manually hard-refreshes -- "no-cache"
    // doesn't mean "don't cache", it means "always ask the server first"
    // (a fast 304 when unchanged, fresh content immediately when not).
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  })
);

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- Auth ------------------------------------------------------------------
//
// Real per-person accounts, scoped to a household. No third-party auth
// provider, no email dependency -- just a username + password stored
// (hashed) in the same local database as everything else, because the app
// is now reachable outside your own network and a passwordless "type any
// household name" model would let anyone read or edit anyone else's data.

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function setSessionCookie(req, res, token) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (req.secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

// Soft lookup -- returns null instead of rejecting, for routes (like
// recipe search) that behave fine either way but personalize a bit when
// someone happens to be signed in.
function getSessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id AS id, u.username AS username, u.household_id AS householdId, h.name AS householdName,
              u.is_admin AS isAdmin, u.must_change_password AS mustChangePassword, u.password_salt AS passwordSalt,
              u.password_hash AS passwordHash, s.expires_at AS expiresAt
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN households h ON h.id = u.household_id
       WHERE s.token = ?`
    )
    .get(token);
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return null;
  }
  return { ...row, isAdmin: !!row.isAdmin, mustChangePassword: !!row.mustChangePassword };
}

// Blocking this server-side (not just redirecting client-side from
// login.html) matters because the accounts most likely to still have
// must_change_password set are the most sensitive ones -- the bootstrap
// admin, and anyone an admin just provisioned -- so a leaked initial
// password shouldn't be usable for anything beyond setting a real one.
function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (user.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required', mustChangePassword: true });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (user.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required', mustChangePassword: true });
  }
  if (!user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  req.user = user;
  next();
}

// Every /api/households/:name/* route acts on the signed-in user's own
// household -- this just guards against a stale/mistyped URL touching a
// different one than the session actually belongs to.
function sameHousehold(req, res) {
  if (req.user.householdName.toLowerCase() !== String(req.params.name || '').toLowerCase()) {
    res.status(403).json({ error: 'Not a member of this household' });
    return false;
  }
  return true;
}

function authResponseBody(user, extra) {
  return {
    ok: true,
    username: user.username,
    household: user.householdName || user.household,
    isAdmin: !!user.isAdmin,
    mustChangePassword: !!user.mustChangePassword,
    ...extra,
  };
}

const USERNAME_RE = /^[a-zA-Z0-9_-]{2,30}$/;

// Creates a brand-new household only -- joining an existing one requires
// an invite (below). Without this, anyone who knew (or guessed) a
// household's name could just sign themselves into it.
app.post('/api/auth/signup', (req, res) => {
  const householdName = String((req.body && req.body.household) || '').trim();
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');

  if (!householdName) return res.status(400).json({ error: 'Household name is required' });
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 2-30 letters, numbers, _ or -' });
  }
  const passwordError = validatePassword(password, { username, household: householdName });
  if (passwordError) return res.status(400).json({ error: passwordError });

  const existingHousehold = db.prepare(`SELECT 1 FROM households WHERE name = ? COLLATE NOCASE`).get(householdName);
  if (existingHousehold) {
    return res.status(409).json({ error: 'That household already exists -- ask a member for an invite link' });
  }

  db.prepare(`INSERT INTO households (name) VALUES (?)`).run(householdName);
  const household = db.prepare(`SELECT * FROM households WHERE name = ? COLLATE NOCASE`).get(householdName);

  const { salt, hash } = hashPassword(password);
  const result = db
    .prepare(`INSERT INTO users (household_id, username, password_hash, password_salt) VALUES (?, ?, ?, ?)`)
    .run(household.id, username, hash, salt);

  const token = createToken();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    token,
    result.lastInsertRowid,
    tokenExpiryIso()
  );
  setSessionCookie(req, res, token);
  res.json(authResponseBody({ username, householdName: household.name, isAdmin: false, mustChangePassword: false }));
});

app.post('/api/auth/login', (req, res) => {
  const householdName = String((req.body && req.body.household) || '').trim();
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const rateLimitKey = `${req.ip}:${householdName.toLowerCase()}:${username.toLowerCase()}`;

  if (isLoginRateLimited(rateLimitKey)) {
    return res.status(429).json({ error: 'Too many attempts -- wait a few minutes and try again' });
  }

  const household = db.prepare(`SELECT * FROM households WHERE name = ? COLLATE NOCASE`).get(householdName);
  const user =
    household &&
    db.prepare(`SELECT * FROM users WHERE household_id = ? AND username = ? COLLATE NOCASE`).get(household.id, username);
  const ok = !!(user && verifyPassword(password, user.password_salt, user.password_hash));
  recordLoginAttempt(rateLimitKey, ok);
  if (!ok) return res.status(401).json({ error: 'Wrong household, username, or password' });

  const token = createToken();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(token, user.id, tokenExpiryIso());
  setSessionCookie(req, res, token);
  res.json(authResponseBody({ username: user.username, householdName: household.name, isAdmin: user.is_admin, mustChangePassword: user.must_change_password }));
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// For any already-signed-in user (forced after an admin-provisioned
// login, or opted into any time from account settings).
// Deliberately NOT behind requireAuth -- that middleware blocks any
// account with must_change_password set, which is exactly the account
// that needs to reach this endpoint. Just needs a valid session.
app.post('/api/auth/change-password', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not signed in' });

  const currentPassword = String((req.body && req.body.currentPassword) || '');
  const newPassword = String((req.body && req.body.newPassword) || '');

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(sessionUser.id);
  if (!verifyPassword(currentPassword, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const passwordError = validatePassword(newPassword, { username: user.username, household: sessionUser.householdName });
  if (passwordError) return res.status(400).json({ error: passwordError });

  const { salt, hash } = hashPassword(newPassword);
  db.prepare(`UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?`).run(
    hash,
    salt,
    user.id
  );
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json(authResponseBody(user));
});

// --- Invites -----------------------------------------------------------
//
// The only way to join an *existing* household. No email is sent by the
// app -- this just generates the link; a member copies it and sends it
// however they want.

function inviteStatus(invite) {
  if (invite.used_at) return 'used';
  if (new Date(invite.expires_at).getTime() < Date.now()) return 'expired';
  return 'pending';
}

// Public: lets the accept-invite page show which household you're
// joining before you commit to a username/password.
app.get('/api/invites/:token', (req, res) => {
  const invite = db
    .prepare(
      `SELECT i.*, h.name AS household_name FROM invites i JOIN households h ON h.id = i.household_id WHERE i.token = ?`
    )
    .get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  const status = inviteStatus(invite);
  if (status !== 'pending') {
    return res.status(410).json({ error: status === 'used' ? 'This invite has already been used' : 'This invite has expired' });
  }
  res.json({ household: invite.household_name, expiresAt: invite.expires_at });
});

app.post('/api/auth/accept-invite', (req, res) => {
  const token = String((req.body && req.body.token) || '').trim();
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');

  if (!token) return res.status(400).json({ error: 'Invite token is required' });
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 2-30 letters, numbers, _ or -' });
  }

  const invite = db.prepare(`SELECT * FROM invites WHERE token = ?`).get(token);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  const status = inviteStatus(invite);
  if (status !== 'pending') {
    return res.status(410).json({ error: status === 'used' ? 'This invite has already been used' : 'This invite has expired' });
  }
  const household = db.prepare(`SELECT name FROM households WHERE id = ?`).get(invite.household_id);

  const passwordError = validatePassword(password, { username, household: household.name });
  if (passwordError) return res.status(400).json({ error: passwordError });

  const existingUser = db
    .prepare(`SELECT 1 FROM users WHERE household_id = ? AND username = ? COLLATE NOCASE`)
    .get(invite.household_id, username);
  if (existingUser) return res.status(409).json({ error: 'That username is already taken in this household' });

  const { salt, hash } = hashPassword(password);
  const result = db
    .prepare(`INSERT INTO users (household_id, username, password_hash, password_salt) VALUES (?, ?, ?, ?)`)
    .run(invite.household_id, username, hash, salt);

  db.prepare(`UPDATE invites SET used_at = datetime('now'), used_by_user_id = ? WHERE id = ?`).run(
    result.lastInsertRowid,
    invite.id
  );

  const sessionToken = createToken();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(
    sessionToken,
    result.lastInsertRowid,
    tokenExpiryIso()
  );
  setSessionCookie(req, res, sessionToken);
  res.json(authResponseBody({ username, householdName: household.name, isAdmin: false, mustChangePassword: false }));
});

app.get('/api/households/:name/invites', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const rows = db
    .prepare(
      `SELECT i.id AS id, i.token AS token, i.note AS note, i.created_at AS createdAt, i.expires_at AS expiresAt,
              i.used_at AS usedAt, u.username AS usedBy, c.username AS createdBy
       FROM invites i
       LEFT JOIN users u ON u.id = i.used_by_user_id
       LEFT JOIN users c ON c.id = i.created_by_user_id
       WHERE i.household_id = ?
       ORDER BY i.created_at DESC
       LIMIT 30`
    )
    .all(req.user.householdId);
  const host = `${req.protocol}://${req.get('host')}`;
  res.json(
    rows.map((r) => ({
      id: r.id,
      status: inviteStatus({ used_at: r.usedAt, expires_at: r.expiresAt }),
      note: r.note,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      usedBy: r.usedBy,
      createdBy: r.createdBy,
      url: `${host}/?invite=${r.token}`,
    }))
  );
});

app.post('/api/households/:name/invites', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const note = req.body && req.body.note ? String(req.body.note).trim().slice(0, 200) : null;
  const token = createToken();
  db.prepare(
    `INSERT INTO invites (household_id, token, note, created_by_user_id, expires_at) VALUES (?, ?, ?, ?, ?)`
  ).run(req.user.householdId, token, note, req.user.id, inviteExpiryIso());

  const host = `${req.protocol}://${req.get('host')}`;
  res.json({ ok: true, url: `${host}/?invite=${token}`, expiresAt: inviteExpiryIso() });
});

app.delete('/api/households/:name/invites/:id', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  db.prepare(`DELETE FROM invites WHERE id = ? AND household_id = ?`).run(req.params.id, req.user.householdId);
  res.json({ ok: true });
});

// --- Admin ---------------------------------------------------------------
//
// A site-wide role (`users.is_admin`), separate from any one household,
// for provisioning accounts directly -- an alternative to the invite
// flow for whoever runs the server. Every account an admin creates is
// forced to change its password on first login.

app.get('/api/admin/households', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT h.id AS id, h.name AS name, COUNT(u.id) AS memberCount
       FROM households h
       LEFT JOIN users u ON u.household_id = h.id
       GROUP BY h.id
       ORDER BY h.name COLLATE NOCASE`
    )
    .all();
  res.json(rows);
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id AS id, u.username AS username, h.name AS household, u.is_admin AS isAdmin,
              u.must_change_password AS mustChangePassword, u.created_at AS createdAt
       FROM users u
       JOIN households h ON h.id = u.household_id
       ORDER BY h.name COLLATE NOCASE, u.username COLLATE NOCASE`
    )
    .all();
  res.json(rows.map((r) => ({ ...r, isAdmin: !!r.isAdmin, mustChangePassword: !!r.mustChangePassword })));
});

// Admin can target an existing household by name (unlike self-signup,
// which only ever creates new ones) -- this is the direct alternative to
// the invite-link flow.
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const householdName = String((req.body && req.body.household) || '').trim();
  const username = String((req.body && req.body.username) || '').trim();
  const password = String((req.body && req.body.password) || '');
  const makeAdmin = !!(req.body && req.body.isAdmin);

  if (!householdName) return res.status(400).json({ error: 'Household name is required' });
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 2-30 letters, numbers, _ or -' });
  }
  const passwordError = validatePassword(password, { username, household: householdName });
  if (passwordError) return res.status(400).json({ error: passwordError });

  let household = db.prepare(`SELECT * FROM households WHERE name = ? COLLATE NOCASE`).get(householdName);
  if (!household) {
    db.prepare(`INSERT INTO households (name) VALUES (?)`).run(householdName);
    household = db.prepare(`SELECT * FROM households WHERE name = ? COLLATE NOCASE`).get(householdName);
  }

  const existingUser = db
    .prepare(`SELECT 1 FROM users WHERE household_id = ? AND username = ? COLLATE NOCASE`)
    .get(household.id, username);
  if (existingUser) return res.status(409).json({ error: 'That username is already taken in this household' });

  const { salt, hash } = hashPassword(password);
  db.prepare(
    `INSERT INTO users (household_id, username, password_hash, password_salt, is_admin, must_change_password)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(household.id, username, hash, salt, makeAdmin ? 1 : 0);

  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const target = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: "Can't delete your own account" });
  db.prepare(`DELETE FROM users WHERE id = ?`).run(target.id);
  res.json({ ok: true });
});

// --- Ingredients (autocomplete) ---------------------------------------

app.get('/api/ingredients', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare(`SELECT name FROM ingredients WHERE name LIKE ? ORDER BY name LIMIT 25`).all(`%${q}%`)
    : db.prepare(`SELECT name FROM ingredients ORDER BY name LIMIT 100`).all();
  res.json(rows.map((r) => r.name));
});

// --- Recipes -------------------------------------------------------------

// Categories are TheMealDB's broad groupings (Chicken, Seafood, Dessert,
// Vegetarian, ...) -- this is what separates "dessert" from "dinner".
app.get('/api/categories', (req, res) => {
  const rows = db
    .prepare(`SELECT DISTINCT category FROM recipes WHERE category IS NOT NULL AND category != '' ORDER BY category`)
    .all();
  res.json(rows.map((r) => r.category));
});

// Areas are cuisine/region (American, Chilean, German, Italian, ...).
app.get('/api/areas', (req, res) => {
  const rows = db
    .prepare(`SELECT DISTINCT area FROM recipes WHERE area IS NOT NULL AND area != '' ORDER BY area`)
    .all();
  res.json(rows.map((r) => r.area));
});

// Tags are finer-grained and freeform (Soup, Curry, Spicy, ...) -- this
// is what makes "just show me soups" possible even though Soup isn't a
// category of its own.
app.get('/api/tags', (req, res) => {
  const rows = db.prepare(`SELECT tags FROM recipes WHERE tags IS NOT NULL AND tags != ''`).all();
  const seen = new Set();
  for (const row of rows) {
    for (const tag of row.tags.split(',')) {
      const clean = tag.trim();
      if (clean) seen.add(clean);
    }
  }
  res.json([...seen].sort((a, b) => a.localeCompare(b)));
});

// A regional, hand-curated approximation of what's in season right now
// (Northeastern US) -- not location-aware, just a static harvest
// calendar -- intersected with ingredients actually used in this
// database so the list is useful rather than aspirational.
app.get('/api/seasonal/current', (req, res) => {
  const season = getCurrentSeason();
  const keywords = keywordsForSeason(season);
  const allIngredients = db.prepare(`SELECT name FROM ingredients`).all();
  const inSeason = allIngredients
    .filter((ing) => keywords.some((kw) => ing.name.toLowerCase().includes(kw)))
    .map((ing) => ing.name)
    .sort((a, b) => a.localeCompare(b));
  res.json({ season, ingredients: inSeason });
});

app.get('/api/recipes/match', (req, res) => {
  const have = parseList(req.query.have);
  const exclude = parseList(req.query.exclude);
  const category = String(req.query.category || '').trim() || null;
  const tag = String(req.query.tag || '').trim() || null;
  const area = String(req.query.area || '').trim() || null;
  const seasonalOnly = req.query.seasonal === 'true';

  // If someone happens to be signed in, lightly de-emphasize what their
  // own household cooked in the last 10 days -- purely a ranking nudge,
  // not required for search to work.
  let recentRecipeIds = new Set();
  const sessionUser = getSessionUser(req);
  if (sessionUser) {
    const row = db.prepare(`SELECT cooked_log FROM households WHERE id = ?`).get(sessionUser.householdId);
    if (row) {
      const log = JSON.parse(row.cooked_log);
      const cutoff = Date.now() - 10 * 24 * 60 * 60 * 1000;
      recentRecipeIds = new Set(log.filter((e) => new Date(e.date).getTime() >= cutoff).map((e) => e.recipeId));
    }
  }

  // "Show me what's seasonal" also lightly re-ranks results toward
  // seasonal ingredients even when the filter isn't strictly on.
  const seasonalKeywords = keywordsForSeason(getCurrentSeason());

  const results = matchRecipes(db, {
    have,
    exclude,
    recentRecipeIds,
    category,
    tag,
    area,
    seasonalKeywords,
    seasonalOnly,
  });
  res.json(results);
});

app.get('/api/recipes/:id', (req, res) => {
  const recipe = db.prepare(`SELECT * FROM recipes WHERE id = ?`).get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  const ingredients = db
    .prepare(
      `SELECT i.name AS name, ri.measure AS measure
       FROM recipe_ingredients ri
       JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = ?`
    )
    .all(recipe.id);
  res.json({ ...recipe, ingredients });
});

// --- Households (everything below requires being signed into the
// household it's acting on) -----------------------------------------------

function householdStateJson(householdId, householdName) {
  const row = db.prepare(`SELECT * FROM households WHERE id = ?`).get(householdId);
  return {
    name: householdName,
    liked: JSON.parse(row.liked_ingredients),
    disliked: JSON.parse(row.disliked_ingredients),
    cookedLog: JSON.parse(row.cooked_log),
    planned: JSON.parse(row.planned_recipes || '[]'),
  };
}

app.get('/api/households/:name', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  res.json(householdStateJson(req.user.householdId, req.user.householdName));
});

app.put('/api/households/:name/preferences', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const liked = Array.isArray(req.body.liked) ? req.body.liked : [];
  const disliked = Array.isArray(req.body.disliked) ? req.body.disliked : [];
  db.prepare(
    `UPDATE households SET liked_ingredients = ?, disliked_ingredients = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(liked), JSON.stringify(disliked), req.user.householdId);
  res.json({ ok: true });
});

app.post('/api/households/:name/cooked', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const recipeId = Number(req.body.recipeId);
  if (!recipeId) return res.status(400).json({ error: 'recipeId is required' });
  if (!db.prepare(`SELECT 1 FROM recipes WHERE id = ?`).get(recipeId)) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const row = db.prepare(`SELECT cooked_log FROM households WHERE id = ?`).get(req.user.householdId);
  const log = JSON.parse(row.cooked_log);
  log.unshift({ recipeId, date: new Date().toISOString().slice(0, 10), username: req.user.username });
  const trimmed = log.slice(0, 200); // more headroom now this also backs per-member stats

  db.prepare(`UPDATE households SET cooked_log = ? WHERE id = ?`).run(JSON.stringify(trimmed), req.user.householdId);

  // Best-effort pantry usage: for whatever this recipe needs that's
  // actually sitting in the pantry, decrement a tracked quantity by one
  // unit (there's no structured "2 cups" parsing to decrement precisely
  // by) and log it, so restock suggestions and "what can I make" both
  // reflect reality without anyone logging every ingredient by hand.
  const recipeIngredientIds = db.prepare(`SELECT ingredient_id FROM recipe_ingredients WHERE recipe_id = ?`).all(recipeId);
  const pantryStmt = db.prepare(`SELECT * FROM pantry_items WHERE household_id = ? AND ingredient_id = ?`);
  const decrementStmt = db.prepare(`UPDATE pantry_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`);
  const logUsage = db.prepare(
    `INSERT INTO usage_events (household_id, user_id, ingredient_id, recipe_id, action, quantity) VALUES (?, ?, ?, ?, 'consumed', ?)`
  );

  for (const { ingredient_id: ingredientId } of recipeIngredientIds) {
    const pantryItem = pantryStmt.get(req.user.householdId, ingredientId);
    if (!pantryItem) continue;
    let usedQuantity = null;
    if (pantryItem.quantity !== null) {
      usedQuantity = 1;
      decrementStmt.run(Math.max(0, pantryItem.quantity - 1), pantryItem.id);
    }
    logUsage.run(req.user.householdId, req.user.id, ingredientId, recipeId, usedQuantity);
  }

  res.json({ ok: true });
});

// --- Meal plan + grocery list ---------------------------------------------

app.post('/api/households/:name/plan', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const recipeId = Number(req.body.recipeId);
  if (!recipeId) return res.status(400).json({ error: 'recipeId is required' });
  if (!db.prepare(`SELECT 1 FROM recipes WHERE id = ?`).get(recipeId)) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const row = db.prepare(`SELECT planned_recipes FROM households WHERE id = ?`).get(req.user.householdId);
  const planned = JSON.parse(row.planned_recipes || '[]');
  if (!planned.includes(recipeId)) planned.push(recipeId);

  db.prepare(`UPDATE households SET planned_recipes = ? WHERE id = ?`).run(JSON.stringify(planned), req.user.householdId);
  res.json({ ok: true, planned });
});

app.delete('/api/households/:name/plan/:recipeId', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const recipeId = Number(req.params.recipeId);
  const row = db.prepare(`SELECT planned_recipes FROM households WHERE id = ?`).get(req.user.householdId);
  const planned = JSON.parse(row.planned_recipes || '[]').filter((id) => id !== recipeId);

  db.prepare(`UPDATE households SET planned_recipes = ? WHERE id = ?`).run(JSON.stringify(planned), req.user.householdId);
  res.json({ ok: true, planned });
});

// The grocery list is generated fresh from the current plan each time --
// there's no separate stored list to fall out of sync with the plan.
// Grouped into rough shopping sections (Produce, Meat & Seafood, ...)
// and with anything already in the pantry filtered out.
app.get('/api/households/:name/grocery-list', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const row = db.prepare(`SELECT planned_recipes FROM households WHERE id = ?`).get(req.user.householdId);
  const plannedIds = JSON.parse(row.planned_recipes || '[]');
  const pantrySet = new Set(pantryIngredientNames(db, req.user.householdId).map((p) => p.toLowerCase()));

  const recipeStmt = db.prepare(`SELECT id, name FROM recipes WHERE id = ?`);
  const ingredientsStmt = db.prepare(
    `SELECT i.name AS name, ri.measure AS measure
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id = ?`
  );

  const recipes = [];
  const itemsByIngredient = new Map();

  for (const recipeId of plannedIds) {
    const recipe = recipeStmt.get(recipeId);
    if (!recipe) continue; // recipe database was re-seeded/changed since planning
    recipes.push({ id: recipe.id, name: recipe.name });

    for (const ing of ingredientsStmt.all(recipeId)) {
      if (pantrySet.has(ing.name.toLowerCase())) continue; // already have it -- don't list it
      const key = ing.name.toLowerCase();
      if (!itemsByIngredient.has(key)) {
        itemsByIngredient.set(key, { ingredient: ing.name, section: groceryCategoryFor(ing.name), entries: [] });
      }
      itemsByIngredient.get(key).entries.push({ recipe: recipe.name, measure: ing.measure || '' });
    }
  }

  const items = [...itemsByIngredient.values()].sort((a, b) => {
    const sectionDiff = SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section);
    return sectionDiff !== 0 ? sectionDiff : a.ingredient.localeCompare(b.ingredient);
  });
  res.json({ recipes, items, sections: SECTION_ORDER });
});

// --- Pantry inventory -------------------------------------------------------
//
// Structured (quantity/unit/price/store), not just a name list, so it can
// back "what can I make right now", "buy X to unlock these", and restock
// suggestions based on what you actually use and pay.

function listPantry(householdId) {
  return db
    .prepare(
      `SELECT i.name AS ingredient, p.quantity AS quantity, p.unit AS unit, p.price_paid AS price,
              p.store AS store, u.username AS addedBy, p.purchased_at AS purchasedAt, p.expires_at AS expiresAt
       FROM pantry_items p
       JOIN ingredients i ON i.id = p.ingredient_id
       LEFT JOIN users u ON u.id = p.added_by_user_id
       WHERE p.household_id = ?
       ORDER BY i.name COLLATE NOCASE`
    )
    .all(householdId);
}

app.get('/api/households/:name/pantry', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  res.json(listPantry(req.user.householdId));
});

// Add or restock an item. A restock with a price logs a 'purchased' usage
// event (this is the only price data the app ever has -- what you typed
// in, never a live market lookup).
app.post('/api/households/:name/pantry', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const rawName = String((req.body && req.body.ingredient) || '').trim();
  if (!rawName) return res.status(400).json({ error: 'ingredient is required' });
  const ingredientId = getOrCreateIngredientId(rawName);

  const hasQuantity = req.body.quantity !== undefined && req.body.quantity !== null && req.body.quantity !== '';
  const quantity = hasQuantity ? Number(req.body.quantity) : null;
  if (hasQuantity && Number.isNaN(quantity)) return res.status(400).json({ error: 'quantity must be a number' });
  const unit = req.body.unit ? String(req.body.unit).trim() : null;
  const hasPrice = req.body.price !== undefined && req.body.price !== null && req.body.price !== '';
  const price = hasPrice ? Number(req.body.price) : null;
  if (hasPrice && Number.isNaN(price)) return res.status(400).json({ error: 'price must be a number' });
  const store = req.body.store ? String(req.body.store).trim() : null;

  const existing = db
    .prepare(`SELECT * FROM pantry_items WHERE household_id = ? AND ingredient_id = ?`)
    .get(req.user.householdId, ingredientId);

  // Restocking an item with a numeric quantity adds to what's already
  // tracked; restocking without a quantity (or an item that was
  // untracked) just refreshes price/store/who-added-it.
  let newQuantity = quantity;
  if (existing && existing.quantity !== null && quantity !== null) {
    newQuantity = existing.quantity + quantity;
  } else if (existing && quantity === null) {
    newQuantity = existing.quantity;
  }

  db.prepare(
    `INSERT INTO pantry_items (household_id, ingredient_id, quantity, unit, price_paid, store, added_by_user_id, purchased_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(household_id, ingredient_id) DO UPDATE SET
       quantity = excluded.quantity,
       unit = COALESCE(excluded.unit, pantry_items.unit),
       price_paid = COALESCE(excluded.price_paid, pantry_items.price_paid),
       store = COALESCE(excluded.store, pantry_items.store),
       added_by_user_id = excluded.added_by_user_id,
       purchased_at = datetime('now'),
       updated_at = datetime('now')`
  ).run(req.user.householdId, ingredientId, newQuantity, unit, price, store, req.user.id);

  if (hasPrice) {
    db.prepare(
      `INSERT INTO usage_events (household_id, user_id, ingredient_id, action, quantity, price, store)
       VALUES (?, ?, ?, 'purchased', ?, ?, ?)`
    ).run(req.user.householdId, req.user.id, ingredientId, quantity, price, store);
  }

  res.json({ ok: true, pantry: listPantry(req.user.householdId) });
});

// Adjust a tracked quantity, or record that an item was used up / thrown
// out (removes it from the pantry and logs which one it was, so waste
// shows up in the numbers instead of just silently disappearing).
app.patch('/api/households/:name/pantry/:ingredient', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const clean = canonicalizeIngredientName(req.params.ingredient);
  const row = db
    .prepare(
      `SELECT p.* FROM pantry_items p JOIN ingredients i ON i.id = p.ingredient_id
       WHERE p.household_id = ? AND i.name = ? COLLATE NOCASE`
    )
    .get(req.user.householdId, clean);
  if (!row) return res.status(404).json({ error: 'Not in pantry' });

  const action = req.body && req.body.action;
  if (action === 'used_up' || action === 'wasted') {
    db.prepare(`DELETE FROM pantry_items WHERE id = ?`).run(row.id);
    db.prepare(
      `INSERT INTO usage_events (household_id, user_id, ingredient_id, action, quantity) VALUES (?, ?, ?, ?, ?)`
    ).run(req.user.householdId, req.user.id, row.ingredient_id, action === 'used_up' ? 'consumed' : 'wasted', row.quantity);
    return res.json({ ok: true, pantry: listPantry(req.user.householdId) });
  }

  if (req.body && req.body.quantity !== undefined) {
    const quantity = req.body.quantity === null || req.body.quantity === '' ? null : Number(req.body.quantity);
    if (quantity !== null && Number.isNaN(quantity)) return res.status(400).json({ error: 'quantity must be a number' });
    db.prepare(`UPDATE pantry_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(quantity, row.id);
  }
  res.json({ ok: true, pantry: listPantry(req.user.householdId) });
});

// Plain removal -- "added this by mistake", no usage event.
app.delete('/api/households/:name/pantry/:ingredient', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const clean = canonicalizeIngredientName(req.params.ingredient);
  db.prepare(
    `DELETE FROM pantry_items WHERE household_id = ? AND ingredient_id = (SELECT id FROM ingredients WHERE name = ? COLLATE NOCASE)`
  ).run(req.user.householdId, clean);
  res.json({ ok: true, pantry: listPantry(req.user.householdId) });
});

app.get('/api/households/:name/pantry/insights', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  res.json(pantryInsights(db, req.user.householdId));
});

app.get('/api/households/:name/pantry/restock-suggestions', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  res.json(restockSuggestions(db, req.user.householdId));
});

// --- Members -----------------------------------------------------------
//
// Everyone in a household can see who else is in it and what they cook --
// that mutual visibility is the point of a shared household, unlike the
// pantry/price data which stays scoped to the household as a whole.

app.get('/api/households/:name/members', requireAuth, (req, res) => {
  if (!sameHousehold(req, res)) return;
  const members = db
    .prepare(`SELECT username FROM users WHERE household_id = ? ORDER BY username COLLATE NOCASE`)
    .all(req.user.householdId);
  const row = db.prepare(`SELECT cooked_log FROM households WHERE id = ?`).get(req.user.householdId);
  const cookedLog = JSON.parse(row.cooked_log || '[]');
  const recipeNameStmt = db.prepare(`SELECT name FROM recipes WHERE id = ?`);

  const result = members.map((m) => {
    const entries = cookedLog.filter((e) => e.username && e.username.toLowerCase() === m.username.toLowerCase());
    const counts = new Map();
    for (const e of entries) {
      const recipe = recipeNameStmt.get(e.recipeId);
      if (!recipe) continue;
      counts.set(recipe.name, (counts.get(recipe.name) || 0) + 1);
    }
    const topRecipes = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    return {
      username: m.username,
      cookCount: entries.length,
      topRecipes,
      isYou: m.username.toLowerCase() === req.user.username.toLowerCase(),
    };
  });

  res.json(result);
});

app.get('/api/health', (req, res) => {
  const recipeCount = db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get().n;
  res.json({ ok: true, recipes: recipeCount });
});

app.listen(PORT, () => {
  console.log(`Foodie listening on http://localhost:${PORT}`);
});
