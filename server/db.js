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

  for (const { displayName, rows: group } of groups.values()) {
    if (group.length < 2) {
      // Lone row -- just make sure its spelling matches the canonical
      // form (e.g. it was inserted before an alias for it existed).
      if (group.length === 1 && group[0].name !== displayName) {
        renameStmt.run(displayName, group[0].id);
      }
      continue;
    }

    // Prefer an existing row that's already spelled exactly right as the
    // keeper; otherwise take the first and rename it.
    const exact = group.find((r) => r.name === displayName);
    const keeper = exact || group[0];
    if (keeper.name !== displayName) renameStmt.run(displayName, keeper.id);

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
  }
}

mergeDuplicateIngredients();

module.exports = db;
