'use strict';

const express = require('express');
const path = require('node:path');
const db = require('./db');
const { matchRecipes } = require('./services/matcher');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function householdRowToJson(row) {
  return {
    name: row.name,
    liked: JSON.parse(row.liked_ingredients),
    disliked: JSON.parse(row.disliked_ingredients),
    cookedLog: JSON.parse(row.cooked_log),
  };
}

// --- Ingredients (autocomplete) ---------------------------------------

app.get('/api/ingredients', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare(`SELECT name FROM ingredients WHERE name LIKE ? ORDER BY name LIMIT 25`).all(`%${q}%`)
    : db.prepare(`SELECT name FROM ingredients ORDER BY name LIMIT 100`).all();
  res.json(rows.map((r) => r.name));
});

// --- Recipes -------------------------------------------------------------

app.get('/api/recipes/match', (req, res) => {
  const have = parseList(req.query.have);
  const exclude = parseList(req.query.exclude);

  let recentRecipeIds = new Set();
  const household = String(req.query.household || '').trim();
  if (household) {
    const row = db.prepare(`SELECT cooked_log FROM households WHERE name = ? COLLATE NOCASE`).get(household);
    if (row) {
      const log = JSON.parse(row.cooked_log);
      const cutoff = Date.now() - 10 * 24 * 60 * 60 * 1000; // last 10 days
      recentRecipeIds = new Set(
        log.filter((e) => new Date(e.date).getTime() >= cutoff).map((e) => e.recipeId)
      );
    }
  }

  const results = matchRecipes(db, { have, exclude, recentRecipeIds });
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

// --- Households (shared preferences, stored only in your own database) --

app.get('/api/households/:name', (req, res) => {
  const row = db.prepare(`SELECT * FROM households WHERE name = ? COLLATE NOCASE`).get(req.params.name);
  if (!row) return res.status(404).json({ error: 'Household not found' });
  res.json(householdRowToJson(row));
});

app.post('/api/households', (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    db.prepare(`INSERT INTO households (name) VALUES (?)`).run(name);
  } catch (err) {
    // Already exists -- fine, just return it below.
  }
  const row = db.prepare(`SELECT * FROM households WHERE name = ? COLLATE NOCASE`).get(name);
  res.json(householdRowToJson(row));
});

app.put('/api/households/:name/preferences', (req, res) => {
  const liked = Array.isArray(req.body.liked) ? req.body.liked : [];
  const disliked = Array.isArray(req.body.disliked) ? req.body.disliked : [];
  const result = db
    .prepare(
      `UPDATE households SET liked_ingredients = ?, disliked_ingredients = ?, updated_at = datetime('now')
       WHERE name = ? COLLATE NOCASE`
    )
    .run(JSON.stringify(liked), JSON.stringify(disliked), req.params.name);
  if (result.changes === 0) return res.status(404).json({ error: 'Household not found' });
  res.json({ ok: true });
});

app.post('/api/households/:name/cooked', (req, res) => {
  const row = db.prepare(`SELECT cooked_log FROM households WHERE name = ? COLLATE NOCASE`).get(req.params.name);
  if (!row) return res.status(404).json({ error: 'Household not found' });
  const recipeId = Number(req.body.recipeId);
  if (!recipeId) return res.status(400).json({ error: 'recipeId is required' });

  const log = JSON.parse(row.cooked_log);
  log.unshift({ recipeId, date: new Date().toISOString().slice(0, 10) });
  const trimmed = log.slice(0, 50);

  db.prepare(`UPDATE households SET cooked_log = ? WHERE name = ? COLLATE NOCASE`).run(
    JSON.stringify(trimmed),
    req.params.name
  );
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => {
  const recipeCount = db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get().n;
  res.json({ ok: true, recipes: recipeCount });
});

app.listen(PORT, () => {
  console.log(`Foodie listening on http://localhost:${PORT}`);
});
