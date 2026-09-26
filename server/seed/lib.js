'use strict';

// Shared upsert logic for anything that loads recipes into the database --
// used by both the TheMealDB seed and the curated American-recipes seed,
// so "insert or update a recipe and its ingredient list" only exists once.

const db = require('../db');
const { canonicalizeIngredientName } = require('../data/ingredient-aliases');

function getOrCreateIngredientId(name) {
  // Collapse known variants ("Carrots" -> "Carrot") before insert/lookup
  // so they never split into separate rows in the first place. See
  // server/data/ingredient-aliases.js.
  const clean = canonicalizeIngredientName(name);
  db.prepare(`INSERT OR IGNORE INTO ingredients (name) VALUES (?)`).run(clean);
  return db.prepare(`SELECT id FROM ingredients WHERE name = ? COLLATE NOCASE`).get(clean).id;
}

const insertRecipeStmt = db.prepare(`
  INSERT INTO recipes (external_id, name, category, area, instructions, image_url, source_url, source, tags)
  VALUES (@external_id, @name, @category, @area, @instructions, @image_url, @source_url, @source, @tags)
  ON CONFLICT(external_id) DO UPDATE SET
    name = excluded.name,
    category = excluded.category,
    area = excluded.area,
    instructions = excluded.instructions,
    image_url = excluded.image_url,
    source_url = excluded.source_url,
    source = excluded.source,
    tags = excluded.tags
`);
const getRecipeIdStmt = db.prepare(`SELECT id FROM recipes WHERE external_id = ?`);
const linkIngredientStmt = db.prepare(`
  INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id, measure) VALUES (?, ?, ?)
`);
const clearLinksStmt = db.prepare(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`);

/**
 * @param {{
 *   externalId: string, name: string, category?: string, area?: string,
 *   instructions?: string, imageUrl?: string, sourceUrl?: string, source: string,
 *   tags?: string, ingredients: Array<[string, string]>,
 * }} recipe
 */
function upsertRecipe(recipe) {
  insertRecipeStmt.run({
    external_id: recipe.externalId,
    name: recipe.name,
    category: recipe.category || null,
    area: recipe.area || null,
    instructions: recipe.instructions || null,
    image_url: recipe.imageUrl || null,
    source_url: recipe.sourceUrl || null,
    source: recipe.source,
    tags: recipe.tags || null,
  });
  const recipeId = getRecipeIdStmt.get(recipe.externalId).id;

  // Re-seeding shouldn't leave stale ingredient links if a recipe's list
  // changed since the last run.
  clearLinksStmt.run(recipeId);

  for (const [ingredientName, measure] of recipe.ingredients) {
    if (!ingredientName || !ingredientName.trim()) continue;
    const ingredientId = getOrCreateIngredientId(ingredientName);
    linkIngredientStmt.run(recipeId, ingredientId, (measure || '').trim());
  }

  return recipeId;
}

module.exports = { upsertRecipe, getOrCreateIngredientId };
