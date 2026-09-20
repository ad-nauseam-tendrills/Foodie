'use strict';

const express = require('express');
const path = require('node:path');
const db = require('./db');
const { matchRecipes } = require('./services/matcher');
const { getCurrentSeason, keywordsForSeason } = require('./data/seasonal');

const app = express();
const PORT = process.env.PORT || 3000;

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

function householdRowToJson(row) {
  return {
    name: row.name,
    liked: JSON.parse(row.liked_ingredients),
    disliked: JSON.parse(row.disliked_ingredients),
    cookedLog: JSON.parse(row.cooked_log),
    planned: JSON.parse(row.planned_recipes || '[]'),
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

// --- Meal plan + grocery list ---------------------------------------------

function getHouseholdOr404(name, res) {
  const row = db.prepare(`SELECT * FROM households WHERE name = ? COLLATE NOCASE`).get(name);
  if (!row) {
    res.status(404).json({ error: 'Household not found' });
    return null;
  }
  return row;
}

app.post('/api/households/:name/plan', (req, res) => {
  const row = getHouseholdOr404(req.params.name, res);
  if (!row) return;
  const recipeId = Number(req.body.recipeId);
  if (!recipeId) return res.status(400).json({ error: 'recipeId is required' });
  if (!db.prepare(`SELECT 1 FROM recipes WHERE id = ?`).get(recipeId)) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const planned = JSON.parse(row.planned_recipes || '[]');
  if (!planned.includes(recipeId)) planned.push(recipeId);

  db.prepare(`UPDATE households SET planned_recipes = ? WHERE name = ? COLLATE NOCASE`).run(
    JSON.stringify(planned),
    req.params.name
  );
  res.json({ ok: true, planned });
});

app.delete('/api/households/:name/plan/:recipeId', (req, res) => {
  const row = getHouseholdOr404(req.params.name, res);
  if (!row) return;
  const recipeId = Number(req.params.recipeId);

  const planned = JSON.parse(row.planned_recipes || '[]').filter((id) => id !== recipeId);

  db.prepare(`UPDATE households SET planned_recipes = ? WHERE name = ? COLLATE NOCASE`).run(
    JSON.stringify(planned),
    req.params.name
  );
  res.json({ ok: true, planned });
});

// The grocery list is generated fresh from the current plan each time --
// there's no separate stored list to fall out of sync with the plan.
app.get('/api/households/:name/grocery-list', (req, res) => {
  const row = getHouseholdOr404(req.params.name, res);
  if (!row) return;
  const plannedIds = JSON.parse(row.planned_recipes || '[]');

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
      const key = ing.name.toLowerCase();
      if (!itemsByIngredient.has(key)) {
        itemsByIngredient.set(key, { ingredient: ing.name, entries: [] });
      }
      itemsByIngredient.get(key).entries.push({ recipe: recipe.name, measure: ing.measure || '' });
    }
  }

  const items = [...itemsByIngredient.values()].sort((a, b) => a.ingredient.localeCompare(b.ingredient));
  res.json({ recipes, items });
});

app.get('/api/health', (req, res) => {
  const recipeCount = db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get().n;
  res.json({ ok: true, recipes: recipeCount });
});

app.listen(PORT, () => {
  console.log(`Foodie listening on http://localhost:${PORT}`);
});
