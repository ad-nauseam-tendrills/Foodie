'use strict';

// Turns raw pantry inventory + usage history into the actual questions
// people ask a pantry: "what can I make right now", "what's one
// ingredient away", and "what do I keep running out of that I should
// probably just buy again". No AI involved -- same ingredient-overlap
// matching as the main search, plus straightforward SQL aggregation over
// your own logged purchases/consumption.

const { matchRecipes } = require('./matcher');

function pantryIngredientNames(db, householdId) {
  return db
    .prepare(
      `SELECT i.name AS name FROM pantry_items p
       JOIN ingredients i ON i.id = p.ingredient_id
       WHERE p.household_id = ? AND (p.quantity IS NULL OR p.quantity > 0)`
    )
    .all(householdId)
    .map((r) => r.name);
}

/**
 * @returns {{ canMakeNow: Array, unlockSuggestions: Array }}
 */
function pantryInsights(db, householdId) {
  const pantryNames = pantryIngredientNames(db, householdId);
  if (pantryNames.length === 0) {
    return { canMakeNow: [], unlockSuggestions: [] };
  }

  const allMatches = matchRecipes(db, { have: pantryNames, limit: 1000 });

  const canMakeNow = allMatches.filter((r) => r.matchPct === 100);

  // Recipes exactly one real ingredient away from 100% -- grouped by that
  // missing ingredient, so "buy eggs" surfaces every recipe it unlocks at
  // once instead of one row per recipe.
  const oneAway = allMatches.filter((r) => r.matchCount > 0 && r.missingIngredients.length === 1);
  const unlockMap = new Map();
  for (const recipe of oneAway) {
    const missing = recipe.missingIngredients[0];
    const key = missing.toLowerCase();
    if (!unlockMap.has(key)) unlockMap.set(key, { ingredient: missing, unlocks: [] });
    unlockMap.get(key).unlocks.push({ id: recipe.id, name: recipe.name, matchPct: recipe.matchPct });
  }
  const unlockSuggestions = [...unlockMap.values()]
    .sort((a, b) => b.unlocks.length - a.unlocks.length)
    .slice(0, 20);

  return { canMakeNow, unlockSuggestions };
}

// Ingredients you've used more than once in the last ~2 months but don't
// currently have -- worth restocking. Price/store come only from what
// you've actually logged paying, never an external price API.
function restockSuggestions(db, householdId) {
  const usedRecently = db
    .prepare(
      `SELECT ue.ingredient_id AS ingredientId, ing.name AS name, COUNT(*) AS uses
       FROM usage_events ue
       JOIN ingredients ing ON ing.id = ue.ingredient_id
       WHERE ue.household_id = ? AND ue.action = 'consumed'
         AND ue.created_at >= datetime('now', '-60 days')
       GROUP BY ue.ingredient_id
       HAVING uses >= 2
       ORDER BY uses DESC`
    )
    .all(householdId);

  if (usedRecently.length === 0) return [];

  const inPantry = new Set(pantryIngredientNames(db, householdId).map((n) => n.toLowerCase()));
  const priceStmt = db.prepare(
    `SELECT price, store FROM usage_events
     WHERE household_id = ? AND ingredient_id = ? AND action = 'purchased' AND price IS NOT NULL
     ORDER BY created_at DESC LIMIT 10`
  );

  return usedRecently
    .filter((r) => !inPantry.has(r.name.toLowerCase()))
    .slice(0, 10)
    .map((r) => {
      const priceRows = priceStmt.all(householdId, r.ingredientId);
      const avgPrice = priceRows.length
        ? priceRows.reduce((sum, p) => sum + p.price, 0) / priceRows.length
        : null;
      const cheapest = priceRows.length
        ? priceRows.reduce((min, p) => (p.price < min.price ? p : min))
        : null;
      return {
        ingredient: r.name,
        timesUsedRecently: r.uses,
        avgPrice: avgPrice !== null ? Math.round(avgPrice * 100) / 100 : null,
        cheapestKnown: cheapest ? { price: cheapest.price, store: cheapest.store || null } : null,
      };
    });
}

module.exports = { pantryInsights, restockSuggestions, pantryIngredientNames };
