'use strict';

// Uses Node's built-in node:sqlite (available Node >= 22.5, no native
// compile step required) so there is nothing to build on the server and
// no external database service to run or pay for. Everything lives in a
// single file under data/.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

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

module.exports = db;
