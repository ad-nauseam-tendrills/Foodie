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
 *   category?: string, tag?: string, area?: string, nameQuery?: string,
 *   favoriteIds?: Set<number>, favoriteOnly?: boolean,
 *   seasonalKeywords?: string[], seasonalOnly?: boolean,
 * }} opts
 */
function matchRecipes(db, opts = {}) {
  const haveSet = (opts.have || []).map(normalize).filter(Boolean);
  const excludeSet = (opts.exclude || []).map(normalize).filter(Boolean);
  const recentRecipeIds = opts.recentRecipeIds || new Set();
  const favoriteIds = opts.favoriteIds || new Set();
  const favoriteOnly = !!opts.favoriteOnly;
  const limit = opts.limit || 30;
  const category = opts.category ? normalize(opts.category) : null;
  const tag = opts.tag ? normalize(opts.tag) : null;
  const area = opts.area ? normalize(opts.area) : null;
  const nameQuery = opts.nameQuery ? normalize(opts.nameQuery) : null;
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
    if (area && normalize(recipe.area) !== area) continue;
    if (nameQuery && !normalize(recipe.name).includes(nameQuery)) continue;
    if (favoriteOnly && !favoriteIds.has(recipe.id)) continue;

    const recipeTags = parseTags(recipe.tags);
    if (tag && !recipeTags.some((t) => normalize(t).includes(tag))) continue;

    const ingredients = ingredientsStmt.all(recipe.id);
    if (ingredients.length === 0) continue;

    // "Avoid curry" should skip curry DISHES, not just recipes whose
    // ingredient list literally contains the word "curry" -- a chicken
    // curry made with turmeric, garam masala, and coconut milk has no
    // ingredient named "curry" at all, but it's still exactly what
    // someone excluding "curry" means. So exclusions check the recipe's
    // name/category/tags in addition to its ingredients; `have` stays
    // ingredient-only, since "what can I make with this" should mean
    // actual ingredients, not dish concepts.
    if (excludeSet.length) {
      const excludeHaystack = [recipe.name, recipe.category, ...recipeTags, ...ingredients.map((ing) => ing.name)];
      if (excludeHaystack.some((text) => ingredientMatches(text, excludeSet))) continue;
    }

    const matched = ingredients.filter((ing) => ingredientMatches(ing.name, haveSet));
    // If you've said what you like/have, a recipe using none of it isn't
    // a "0% match" worth showing -- it's just not relevant. Without this,
    // adding "chicken" still surfaced every dessert and side dish in the
    // database (ranked lower, but still there), which reads as "the
    // filter didn't do anything." Category/tag/area already hard-filter
    // this way; this makes `have` consistent with them.
    if (haveSet.length > 0 && matched.length === 0) continue;
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
      isFavorite: favoriteIds.has(recipe.id),
    });
  }

  results.sort((a, b) => {
    // Searching by name with no ingredients specified isn't a ranking
    // problem -- matchPct is 0 for everything, so the usual comparator
    // would fall through to a fairly meaningless tiebreak. Alphabetical
    // is what anyone typing a name into a search box expects.
    if (nameQuery && haveSet.length === 0) return a.name.localeCompare(b.name);
    // Nudge recently-cooked meals down so the list doesn't repeat itself.
    if (a.recentlyCooked !== b.recentlyCooked) return a.recentlyCooked ? 1 : -1;
    // Actual ingredient match always outranks seasonality -- a recipe
    // using zero of what you have shouldn't jump ahead of one that
    // matches just because it also happens to contain something
    // seasonal. Seasonal only breaks ties between equally-good matches
    // (including the no-filter browse case, where everything is 0%).
    if (b.matchPct !== a.matchPct) return b.matchPct - a.matchPct;
    if (seasonalKeywords) {
      const aSeasonal = a.seasonalIngredients.length > 0;
      const bSeasonal = b.seasonalIngredients.length > 0;
      if (aSeasonal !== bSeasonal) return aSeasonal ? -1 : 1;
    }
    return a.missingIngredients.length - b.missingIngredients.length;
  });

  return results.slice(0, limit);
}

module.exports = { matchRecipes, normalize, ingredientMatches };
