'use strict';

// Pure ingredient-matching search -- no AI/LLM involved. Given what you
// like (and what to avoid), it scores every recipe by how much of it you
// can already make, the same way SuperCook's matching works.

function normalize(s) {
  return String(s || '').toLowerCase().trim();
}

// Loose match so "chicken" (typed) matches "chicken breast" (recipe
// ingredient) and vice versa, without needing a full NLP pipeline.
function ingredientMatches(recipeIngredientName, needleSet) {
  const name = normalize(recipeIngredientName);
  if (!name) return false;
  for (const needle of needleSet) {
    if (!needle) continue;
    if (name === needle || name.includes(needle) || needle.includes(name)) {
      return true;
    }
  }
  return false;
}

function parseTags(tagsField) {
  return String(tagsField || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{
 *   have?: string[], exclude?: string[], recentRecipeIds?: Set<number>, limit?: number,
 *   category?: string, tag?: string,
 *   seasonalKeywords?: string[], seasonalOnly?: boolean,
 * }} opts
 */
function matchRecipes(db, opts = {}) {
  const haveSet = (opts.have || []).map(normalize).filter(Boolean);
  const excludeSet = (opts.exclude || []).map(normalize).filter(Boolean);
  const recentRecipeIds = opts.recentRecipeIds || new Set();
  const limit = opts.limit || 30;
  const category = opts.category ? normalize(opts.category) : null;
  const tag = opts.tag ? normalize(opts.tag) : null;
  const seasonalKeywords = opts.seasonalKeywords || null;
  const seasonalOnly = !!opts.seasonalOnly;

  const recipes = db.prepare(`SELECT id, name, category, area, image_url, tags FROM recipes`).all();
  const ingredientsStmt = db.prepare(`
    SELECT i.name AS name, ri.measure AS measure
    FROM recipe_ingredients ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id = ?
  `);

  const results = [];
  for (const recipe of recipes) {
    if (category && normalize(recipe.category) !== category) continue;

    const recipeTags = parseTags(recipe.tags);
    if (tag && !recipeTags.some((t) => normalize(t).includes(tag))) continue;

    const ingredients = ingredientsStmt.all(recipe.id);
    if (ingredients.length === 0) continue;

    if (excludeSet.length && ingredients.some((ing) => ingredientMatches(ing.name, excludeSet))) {
      continue;
    }

    const matched = ingredients.filter((ing) => ingredientMatches(ing.name, haveSet));
    const missing = ingredients.filter((ing) => !matched.includes(ing));
    const matchPct = haveSet.length === 0 ? 0 : Math.round((matched.length / ingredients.length) * 100);

    const seasonalIngredients = seasonalKeywords
      ? ingredients
          .filter((ing) => seasonalKeywords.some((kw) => normalize(ing.name).includes(kw)))
          .map((ing) => ing.name)
      : [];
    if (seasonalOnly && seasonalIngredients.length === 0) continue;

    results.push({
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      area: recipe.area,
      imageUrl: recipe.image_url,
      tags: recipeTags,
      totalIngredients: ingredients.length,
      matchCount: matched.length,
      matchPct,
      missingIngredients: missing.map((m) => m.name),
      recentlyCooked: recentRecipeIds.has(recipe.id),
      seasonalIngredients,
    });
  }

  results.sort((a, b) => {
    // Nudge recently-cooked meals down so the list doesn't repeat itself.
    if (a.recentlyCooked !== b.recentlyCooked) return a.recentlyCooked ? 1 : -1;
    // When seasonality is in play, break ties toward recipes that use
    // something actually in season right now.
    if (seasonalKeywords) {
      const aSeasonal = a.seasonalIngredients.length > 0;
      const bSeasonal = b.seasonalIngredients.length > 0;
      if (aSeasonal !== bSeasonal) return aSeasonal ? -1 : 1;
    }
    if (b.matchPct !== a.matchPct) return b.matchPct - a.matchPct;
    return a.missingIngredients.length - b.missingIngredients.length;
  });

  return results.slice(0, limit);
}

module.exports = { matchRecipes, normalize, ingredientMatches };
