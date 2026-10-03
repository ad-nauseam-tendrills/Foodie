'use strict';

// Uses Node's built-in node:sqlite (available Node >= 22.5, no native
// compile step required) so there is nothing to build on the server and
// no external database service to run or pay for. Everything lives in a
// single file under data/.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { canonicalizeIngredientName } = require('./data/ingredient-aliases');
const { hashPassword, generateTempPassword } = require('./services/auth');

const DATA_DIR = process.env.FOODIE_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'foodie.db');
const db = new DatabaseSync(DB_PATH);

// Fresh-install shape. On an existing database these CREATE TABLE
// statements are no-ops (tables already exist, possibly with an older
// column layout) -- migrateHouseholdsToUsers() below is what brings an
// existing install's actual structure up to date.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE,
    name TEXT NOT NULL,
    category TEXT,
    area TEXT,
    instructions TEXT,
    image_url TEXT,
    source_url TEXT,
    source TEXT NOT NULL DEFAULT 'TheMealDB',
    tags TEXT
  );

  CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  );

  CREATE TABLE IF NOT EXISTS recipe_ingredients (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    measure TEXT,
    PRIMARY KEY (recipe_id, ingredient_id)
  );

  CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
  CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);

  -- Individual accounts -- no household layer. Each person's
  -- liked/disliked ingredients, cooked history, meal plan, and favorites
  -- are their own. "email" is just the login identifier people happen to
  -- type their email address into -- there's no outbound mail capability
  -- in this app, so it's never validated as a real address or used to
  -- send anything.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    liked_ingredients TEXT NOT NULL DEFAULT '[]',
    disliked_ingredients TEXT NOT NULL DEFAULT '[]',
    cooked_log TEXT NOT NULL DEFAULT '[]',
    planned_recipes TEXT NOT NULL DEFAULT '[]',
    favorite_recipes TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  -- Structured pantry inventory -- quantity/unit/price/store per
  -- ingredient, owned directly by one account.
  CREATE TABLE IF NOT EXISTS pantry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity REAL,
    unit TEXT,
    price_paid REAL,
    store TEXT,
    purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, ingredient_id)
  );

  -- One row per pantry event (purchased / consumed / wasted) -- the raw
  -- log that usage metrics, restock suggestions, and per-ingredient price
  -- history are all computed from.
  CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'purchased' | 'consumed' | 'wasted'
    quantity REAL,
    price REAL,
    store TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Self-signup is disabled (see server/index.js); this is the other way
  -- to get an account besides an admin creating one directly. A token is
  -- a one-time credential, not tied to any resource beyond "create a new
  -- account" -- there's no household to join anymore.
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    note TEXT,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  -- Caches barcode -> product name lookups against Open Food Facts (free,
  -- no API key) so re-scanning the same product later never needs another
  -- outbound call -- once a barcode's product name is known, it's known
  -- for good. "found = 0" rows are cached too (briefly re-checked, see
  -- server/index.js) so repeatedly scanning something not in that
  -- database doesn't hammer it either.
  CREATE TABLE IF NOT EXISTS barcode_cache (
    upc TEXT PRIMARY KEY,
    found INTEGER NOT NULL,
    name TEXT,
    brand TEXT,
    looked_up_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function addColumnIfMissing(table, column, definition) {
  const exists = db
    .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
    .get(table, column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('recipes', 'tags', 'TEXT');

// One-time, irreversible structural migration: households used to own
// shared liked/disliked/cooked-log/plan/favorites/pantry, with users
// scoped underneath them; now each account owns all of that directly.
// Rebuilt via the standard SQLite "create new table, copy data, swap in"
// pattern rather than surgical ALTERs, since this touches primary keys,
// foreign keys, and unique constraints across four tables at once --
// much easier to reason about and test as one atomic transaction than as
// a sequence of in-place renames/drops.
function migrateHouseholdsToUsers() {
  const householdsTableExists = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'households'`)
    .get();
  if (!householdsTableExists) return; // fresh install, or already migrated

  const usersHasHouseholdId = db
    .prepare(`SELECT 1 FROM pragma_table_info('users') WHERE name = 'household_id'`)
    .get();
  if (!usersHasHouseholdId) {
    // households exists but users is already in the new shape -- an
    // interrupted previous run got far enough to swap users in but not
    // to drop households. Nothing left to copy; just finish cleaning up.
    db.exec(`DROP TABLE households`);
    return;
  }

  console.log('[migrate] Removing the household model -- moving data to individual accounts...');

  // PRAGMA foreign_keys can't be changed inside a transaction, and this
  // migration needs it off: dropping `users` while `sessions`,
  // `pantry_items`, etc. still hold old-shape foreign keys into it would
  // otherwise fail the moment any row is touched.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    const households = db.prepare(`SELECT * FROM households`).all();
    const householdsById = new Map(households.map((h) => [h.id, h]));
    const oldUsers = db.prepare(`SELECT * FROM users ORDER BY id`).all();
    const oldPantryItems = db.prepare(`SELECT * FROM pantry_items`).all();

    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        liked_ingredients TEXT NOT NULL DEFAULT '[]',
        disliked_ingredients TEXT NOT NULL DEFAULT '[]',
        cooked_log TEXT NOT NULL DEFAULT '[]',
        planned_recipes TEXT NOT NULL DEFAULT '[]',
        favorite_recipes TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    const insertUser = db.prepare(`
      INSERT INTO users_new (id, email, password_hash, password_salt, is_admin, must_change_password,
        liked_ingredients, disliked_ingredients, cooked_log, planned_recipes, favorite_recipes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const emailsUsed = new Set();
    for (const u of oldUsers) {
      const household = householdsById.get(u.household_id);
      // Usernames used to only need to be unique within a household --
      // flattened to one global namespace, two people both named
      // "admin" in different households would collide. Disambiguate
      // rather than silently dropping/overwriting an account; this is
      // rare enough that a visible, slightly ugly fallback is fine.
      let email = u.username;
      if (emailsUsed.has(email.toLowerCase())) {
        const disambiguated = `${u.username}-${u.id}`;
        console.warn(`[migrate] "${u.username}" already taken after flattening households -- using "${disambiguated}" instead`);
        email = disambiguated;
      }
      emailsUsed.add(email.toLowerCase());

      insertUser.run(
        u.id,
        email,
        u.password_hash,
        u.password_salt,
        u.is_admin,
        u.must_change_password,
        household ? household.liked_ingredients : '[]',
        household ? household.disliked_ingredients : '[]',
        household ? household.cooked_log : '[]',
        household ? household.planned_recipes : '[]',
        household && household.favorite_recipes ? household.favorite_recipes : '[]',
        u.created_at
      );
    }

    // Households with 2+ members had one shared pantry/preferences --
    // there's no way to know who "owns" what within that, so everyone
    // who was in it starts with their own identical copy. They diverge
    // from there; nobody loses data.
    const userIdsByHousehold = new Map();
    for (const u of oldUsers) {
      if (!userIdsByHousehold.has(u.household_id)) userIdsByHousehold.set(u.household_id, []);
      userIdsByHousehold.get(u.household_id).push(u.id);
    }

    db.exec(`
      CREATE TABLE pantry_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
        quantity REAL,
        unit TEXT,
        price_paid REAL,
        store TEXT,
        purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, ingredient_id)
      );
    `);
    const insertPantryItem = db.prepare(`
      INSERT INTO pantry_items_new
        (user_id, ingredient_id, quantity, unit, price_paid, store, purchased_at, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of oldPantryItems) {
      const memberIds = userIdsByHousehold.get(p.household_id) || [];
      for (const userId of memberIds) {
        insertPantryItem.run(userId, p.ingredient_id, p.quantity, p.unit, p.price_paid, p.store, p.purchased_at, p.expires_at, p.updated_at);
      }
    }

    // usage_events already tracks who acted (user_id) separately from
    // whose pantry it was (household_id) -- now that pantry is personal,
    // those are the same thing, so just drop household_id and keep the
    // rest untouched.
    db.exec(`
      CREATE TABLE usage_events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
        recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        quantity REAL,
        price REAL,
        store TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      INSERT INTO usage_events_new (id, user_id, ingredient_id, recipe_id, action, quantity, price, store, created_at)
      SELECT id, user_id, ingredient_id, recipe_id, action, quantity, price, store, created_at FROM usage_events
    `);

    // invites: drop household_id, everything else (token, note, who
    // created/used it, expiry) carries over unchanged -- still valid
    // ways to create a new account, just not tied to a household anymore.
    db.exec(`
      CREATE TABLE invites_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        note TEXT,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        used_at TEXT,
        used_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      );
    `);
    db.exec(`
      INSERT INTO invites_new (id, token, note, created_by_user_id, created_at, expires_at, used_at, used_by_user_id)
      SELECT id, token, note, created_by_user_id, created_at, expires_at, used_at, used_by_user_id FROM invites
    `);

    db.exec(`DROP TABLE users`);
    db.exec(`ALTER TABLE users_new RENAME TO users`);
    db.exec(`DROP TABLE pantry_items`);
    db.exec(`ALTER TABLE pantry_items_new RENAME TO pantry_items`);
    db.exec(`DROP TABLE usage_events`);
    db.exec(`ALTER TABLE usage_events_new RENAME TO usage_events`);
    db.exec(`DROP TABLE invites`);
    db.exec(`ALTER TABLE invites_new RENAME TO invites`);
    db.exec(`DROP TABLE households`);

    db.exec('COMMIT');
    console.log(`[migrate] Done -- ${oldUsers.length} account(s) moved off the household model.`);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

migrateHouseholdsToUsers();

// Safe to run unconditionally regardless of which path (fresh install vs.
// migrated) created these tables.
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_pantry_items_user ON pantry_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id);
  CREATE INDEX IF NOT EXISTS idx_usage_events_ingredient ON usage_events(user_id, ingredient_id);
  CREATE INDEX IF NOT EXISTS idx_invites_created_by ON invites(created_by_user_id);
`);

// Merges ingredient rows that are really the same thing under different
// spellings (see server/data/ingredient-aliases.js), for databases that
// already have both e.g. "Carrot" and "Carrots" as separate rows from
// before that file existed. Safe to run on every startup -- once merged,
// there's nothing left to do.
function mergeDuplicateIngredients() {
  const rows = db.prepare(`SELECT id, name FROM ingredients`).all();

  // Group existing rows by their canonical name -- keyed lower-case,
  // since the table enforces uniqueness case-insensitively (COLLATE
  // NOCASE) but plain string equality doesn't. Without this, "carrot"
  // and an alias-derived "Carrot" landed in two different single-row
  // "groups" here, and renaming one to match the other's case then blew
  // up against the database's own case-insensitive constraint.
  const groups = new Map(); // lowercase canonical -> { displayName, rows }
  for (const row of rows) {
    const canonical = canonicalizeIngredientName(row.name);
    const key = canonical.toLowerCase();
    if (!groups.has(key)) groups.set(key, { displayName: canonical, rows: [] });
    const group = groups.get(key);
    group.rows.push(row);
    // An alias firing (canonical form differs from the row's own name)
    // is a stronger signal for the "right" spelling than just whichever
    // row happened to be grouped first.
    if (canonical !== row.name) group.displayName = canonical;
  }

  const getLinksStmt = db.prepare(`SELECT recipe_id, measure FROM recipe_ingredients WHERE ingredient_id = ?`);
  const hasLinkStmt = db.prepare(
    `SELECT 1 FROM recipe_ingredients WHERE recipe_id = ? AND ingredient_id = ?`
  );
  const relinkStmt = db.prepare(
    `UPDATE recipe_ingredients SET ingredient_id = ? WHERE recipe_id = ? AND ingredient_id = ?`
  );
  const deleteLinkStmt = db.prepare(
    `DELETE FROM recipe_ingredients WHERE recipe_id = ? AND ingredient_id = ?`
  );
  const renameStmt = db.prepare(`UPDATE ingredients SET name = ? WHERE id = ?`);
  const deleteIngredientStmt = db.prepare(`DELETE FROM ingredients WHERE id = ?`);
  const collisionStmt = db.prepare(`SELECT id FROM ingredients WHERE name = ? COLLATE NOCASE AND id != ?`);

  // Renaming a row to its "proper" spelling is a cosmetic cleanup, not
  // something worth crashing server startup over if some data pattern
  // this function's author didn't anticipate makes it collide anyway --
  // it already crashed production twice on edge cases two rounds of
  // testing missed. Check for a collision first and just skip that one
  // rename (leaving the row's current spelling) rather than let it throw.
  function safeRename(id, currentName, targetName) {
    if (currentName === targetName) return;
    if (collisionStmt.get(targetName, id)) {
      console.warn(
        `[ingredient-merge] skipping rename of ingredient #${id} "${currentName}" -> "${targetName}" ` +
          `(another row already has that name) -- leaving as-is`
      );
      return;
    }
    renameStmt.run(targetName, id);
  }

  for (const { displayName, rows: group } of groups.values()) {
    if (group.length < 2) {
      // Lone row -- just make sure its spelling matches the canonical
      // form (e.g. it was inserted before an alias for it existed).
      if (group.length === 1) safeRename(group[0].id, group[0].name, displayName);
      continue;
    }

    // Prefer an existing row that's already spelled exactly right as the
    // keeper; otherwise take the first.
    const exact = group.find((r) => r.name === displayName);
    const keeper = exact || group[0];

    // Merge every other row into the keeper BEFORE renaming it -- once
    // they're gone, nothing in this group can still collide with the
    // keeper's target name.
    for (const dup of group) {
      if (dup.id === keeper.id) continue;
      for (const link of getLinksStmt.all(dup.id)) {
        if (hasLinkStmt.get(link.recipe_id, keeper.id)) {
          // That recipe already links to the keeper -- drop the
          // duplicate link rather than violate the (recipe_id,
          // ingredient_id) primary key.
          deleteLinkStmt.run(link.recipe_id, dup.id);
        } else {
          relinkStmt.run(keeper.id, link.recipe_id, dup.id);
        }
      }
      deleteIngredientStmt.run(dup.id);
    }

    safeRename(keeper.id, keeper.name, displayName);
  }
}

mergeDuplicateIngredients();

// First-ever boot needs *someone* who can sign in to provision the rest
// of the accounts -- there's no email flow, so it can't be "check your
// inbox." Instead: if no admin exists yet, create one with a random
// password that's printed once and saved to a file, and require it to
// be changed on first login rather than leaving a known password sitting
// around after that.
function bootstrapAdmin() {
  if (db.prepare(`SELECT 1 FROM users WHERE is_admin = 1`).get()) return;

  const email = 'admin';
  const password = generateTempPassword();
  const { salt, hash } = hashPassword(password);
  db.prepare(
    `INSERT INTO users (email, password_hash, password_salt, is_admin, must_change_password) VALUES (?, ?, ?, 1, 1)`
  ).run(email, hash, salt);

  const passwordFile = path.join(DATA_DIR, 'ADMIN_INITIAL_PASSWORD.txt');
  const message =
    `\n==============================================================\n` +
    `Foodie: created the initial admin account\n` +
    `  Email:     ${email}\n` +
    `  Password:  ${password}\n` +
    `You'll be required to set a new password on first login.\n` +
    `This is also saved to: ${passwordFile}\n` +
    `==============================================================\n`;
  console.log(message);
  try {
    fs.writeFileSync(passwordFile, message);
  } catch (err) {
    console.warn(`Could not write ${passwordFile}: ${err.message}`);
  }
}

bootstrapAdmin();

module.exports = db;
