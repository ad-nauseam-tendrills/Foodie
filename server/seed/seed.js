'use strict';

// Seeds the local database from TheMealDB (https://www.themealdb.com), a
// recipe database that is free and open at the point of access. This is
// a ONE-TIME import: run it once (or re-run any time to refresh), and
// from then on the app runs entirely off your own local database file --
// no ongoing calls to TheMealDB, no API key, no subscription.
//
// TheMealDB's free tier doesn't expose a single "give me everything"
// endpoint, so this walks the alphabet with search.php?f=<letter>, which
// is the standard, documented way to pull the full free catalog (~300+
// recipes) without a paid supporter key.
//
// Run this from wherever the app will actually serve traffic (your
// droplet, your own machine) -- it just needs normal outbound internet
// access, which a sandboxed dev/build environment may not have.

const db = require('../db');
const { upsertRecipe } = require('./lib');

const BASE_URL = 'https://www.themealdb.com/api/json/v1/1';
const LETTERS_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
const REQUEST_DELAY_MS = 250; // be polite to a free public API

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function importMeal(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const ingredientName = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (!ingredientName || !ingredientName.trim()) continue;
    ingredients.push([ingredientName, measure]);
  }

  upsertRecipe({
    externalId: meal.idMeal,
    name: meal.strMeal,
    category: meal.strCategory,
    area: meal.strArea,
    instructions: meal.strInstructions,
    imageUrl: meal.strMealThumb,
    sourceUrl: meal.strSource || `https://www.themealdb.com/meal/${meal.idMeal}`,
    source: 'TheMealDB',
    // TheMealDB's freeform tags (e.g. "Soup,Curry,Spicy") -- separate
    // from strCategory, and what makes something like "just soups"
    // filterable even though "Soup" isn't its own category.
    tags: meal.strTags,
    ingredients,
  });
}

async function seedByLetter(letter) {
  const url = `${BASE_URL}/search.php?f=${letter}`;
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.warn(`  [${letter}] network error: ${err.message}`);
    return 0;
  }
  if (!response.ok) {
    console.warn(`  [${letter}] HTTP ${response.status}`);
    return 0;
  }
  const data = await response.json();
  const meals = data.meals || [];
  for (const meal of meals) importMeal(meal);
  return meals.length;
}

(async () => {
  console.log('Seeding Foodie from TheMealDB (free, open recipe API)...\n');
  let total = 0;
  for (const letter of LETTERS_AND_DIGITS) {
    const count = await seedByLetter(letter);
    if (count) console.log(`  ${letter}: +${count} recipes`);
    total += count;
    await sleep(REQUEST_DELAY_MS);
  }

  const recipeCount = db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get().n;
  const ingredientCount = db.prepare(`SELECT COUNT(*) AS n FROM ingredients`).get().n;

  console.log(`\nDone. ${recipeCount} recipes, ${ingredientCount} distinct ingredients in the local database.`);
  console.log('Attribution: recipe data courtesy of TheMealDB (themealdb.com), used under its free-tier API terms.');
  console.log('Your app now runs entirely from the local database file -- no further calls to TheMealDB are needed.');
  console.log('\nTip: TheMealDB is thin on classic American home cooking -- run `npm run seed:american`');
  console.log('to add a small hand-curated set (chicken noodle soup, meatloaf, pot roast, ...).');
})();
