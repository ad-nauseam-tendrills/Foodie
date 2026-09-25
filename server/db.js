'use strict';

// Uses Node's built-in node:sqlite (available Node >= 22.5, no native
// compile step required) so there is nothing to build on the server and
// no external database service to run or pay for. Everything lives in a
// single file under data/.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { canonicalizeIngredientName } = require('./data/ingredient-aliases');

const DATA_DIR = process.env.FOODIE_DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'foodie.db');
const db = new DatabaseSync(DB_PATH);

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

  -- A "household" is just a shared name your devices point at so
  -- preferences and cooked history sync between your phone/laptop.
  -- No password, no third party -- it only exists in your own database.
  CREATE TABLE IF NOT EXISTS households (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    liked_ingredients TEXT NOT NULL DEFAULT '[]',
    disliked_ingredients TEXT NOT NULL DEFAULT '[]',
    cooked_log TEXT NOT NULL DEFAULT '[]',
    planned_recipes TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
  CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);

  -- Real accounts (username + password) scoped to a household, so
  -- multiple people can share one household's data while each keeping
  -- their own login -- needed once the app is reachable outside your own
  -- network, where a passwordless "type any household name" model would
  -- let anyone read or edit anyone else's household.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (household_id, username COLLATE NOCASE)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  -- Structured pantry inventory -- what a household actually has on
  -- hand, with quantity/unit/price/store, replacing the old flat
  -- "pantry_ingredients" name list (still migrated in below).
  CREATE TABLE IF NOT EXISTS pantry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity REAL,
    unit TEXT,
    price_paid REAL,
    store TEXT,
    added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (household_id, ingredient_id)
  );

  -- One row per pantry event (purchased / consumed / wasted) -- the raw
  -- log that usage metrics, restock suggestions, and per-ingredient price
  -- history are all computed from, rather than trying to keep running
  -- totals in sync by hand.
  CREATE TABLE IF NOT EXISTS usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'purchased' | 'consumed' | 'wasted' | 'cooked'
    quantity REAL,
    price REAL,
    store TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Joining an *existing* household requires one of these -- signup only
  -- creates a brand-new household. There's no email sending here; a link
  -- built from the token is generated for a member to send however they
  -- want (text, email, whatever).
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    note TEXT,
    created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_household ON users(household_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_pantry_items_household ON pantry_items(household_id);
  CREATE INDEX IF NOT EXISTS idx_usage_events_household ON usage_events(household_id);
  CREATE INDEX IF NOT EXISTS idx_usage_events_ingredient ON usage_events(household_id, ingredient_id);
  CREATE INDEX IF NOT EXISTS idx_invites_household ON invites(household_id);
`);

// Migrations for databases created before these columns existed --
// CREATE TABLE IF NOT EXISTS above is a no-op on an existing table, so an
// already-seeded database needs each column added explicitly.
function addColumnIfMissing(table, column, definition) {
  const exists = db
    .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
    .get(table, column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('recipes', 'tags', 'TEXT');
addColumnIfMissing('households', 'planned_recipes', `TEXT NOT NULL DEFAULT '[]'`);
addColumnIfMissing('households', 'pantry_ingredients', `TEXT NOT NULL DEFAULT '[]'`);

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

// One-time migration: the pantry used to be a flat JSON array of names
// on the household row (`pantry_ingredients`); it's now the structured
// `pantry_items` table (quantity/unit/price/store per ingredient).
// Convert any leftover legacy data into real rows, then clear the old
// column so this doesn't re-add something a member deliberately removed
// from the new table on a later startup.
function migrateLegacyPantry() {
  const rows = db
    .prepare(`SELECT id, pantry_ingredients FROM households WHERE pantry_ingredients IS NOT NULL AND pantry_ingredients != '[]'`)
    .all();
  if (!rows.length) return;

  const insertIngredient = db.prepare(`INSERT OR IGNORE INTO ingredients (name) VALUES (?)`);
  const getIngredientId = db.prepare(`SELECT id FROM ingredients WHERE name = ? COLLATE NOCASE`);
  const insertPantryItem = db.prepare(
    `INSERT OR IGNORE INTO pantry_items (household_id, ingredient_id) VALUES (?, ?)`
  );
  const clearLegacy = db.prepare(`UPDATE households SET pantry_ingredients = '[]' WHERE id = ?`);

  for (const row of rows) {
    let names;
    try {
      names = JSON.parse(row.pantry_ingredients);
    } catch {
      names = [];
    }
    for (const raw of names) {
      const clean = canonicalizeIngredientName(raw);
      if (!clean) continue;
      insertIngredient.run(clean);
      const ingredient = getIngredientId.get(clean);
      if (ingredient) insertPantryItem.run(row.id, ingredient.id);
    }
    clearLegacy.run(row.id);
  }
}

migrateLegacyPantry();

module.exports = db;
