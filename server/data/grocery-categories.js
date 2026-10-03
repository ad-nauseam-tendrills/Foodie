'use strict';

// Groups grocery-list ingredients into rough shopping sections so the
// list reads like an actual store layout instead of one flat
// alphabetical dump. Keyword-matched against the ingredient name, same
// style as seasonal.js -- a small hand-maintained list, extend it as
// new ingredients don't fit anywhere sensible (they'll land in "Other").
//
// Order here is also display order.
const SECTIONS = [
  {
    name: 'Produce',
    keywords: [
      'onion', 'garlic', 'carrot', 'celery', 'potato', 'tomato',
      // Specific pepper/chili forms only -- bare "pepper" and "chili"
      // stay out of Produce since they overwhelmingly mean ground black
      // pepper or chili powder in an ingredient list, not the vegetable.
      'bell pepper', 'jalapeno', 'jalapeño', 'poblano', 'habanero', 'serrano', 'chili pepper',
      'chile pepper',
      'lettuce', 'spinach', 'kale', 'cabbage', 'broccoli', 'cauliflower', 'zucchini', 'squash',
      'pumpkin', 'cucumber', 'mushroom', 'corn', 'pea', 'bean', 'asparagus', 'apple', 'lemon',
      'lime', 'orange', 'banana', 'berry', 'berries', 'cherry', 'peach', 'pear', 'plum', 'grape',
      'melon', 'avocado', 'basil', 'cilantro', 'parsley', 'thyme', 'rosemary', 'mint', 'chive',
      'scallion', 'shallot', 'leek', 'ginger', 'eggplant', 'radish', 'beet', 'turnip', 'parsnip',
      'fig', 'cranberry', 'cranberries', 'brussels sprout',
    ],
  },
  {
    name: 'Meat & Seafood',
    keywords: [
      'chicken', 'beef', 'pork', 'lamb', 'goat', 'bacon', 'sausage', 'bratwurst', 'chorizo',
      'andouille', 'ham', 'steak', 'turkey', 'duck', 'veal',
      'shrimp', 'fish', 'salmon', 'tuna', 'cod', 'clam', 'mussel', 'crab', 'lobster', 'anchovy',
    ],
  },
  {
    name: 'Grains, Bread & Pasta',
    // Checked before Dairy & Eggs so "Egg Noodles" lands here (via
    // "noodle") rather than in Dairy & Eggs (via "egg") -- the more
    // specific product name should win.
    keywords: [
      'flour', 'rice', 'pasta', 'noodle', 'spaghetti', 'macaroni', 'ziti', 'bread', 'breadcrumb',
      'bun', 'biscuit', 'cornmeal', 'oat', 'tortilla', 'crust', 'spätzle', 'spatzle',
    ],
  },
  {
    name: 'Dairy & Eggs',
    keywords: [
      'milk', 'cream', 'butter', 'cheese', 'yogurt', 'egg', 'buttermilk',
      'ricotta', 'mozzarella', 'cheddar', 'parmesan', 'gruyere', 'gruyère',
    ],
  },
  {
    name: 'Canned, Jarred & Condiments',
    keywords: [
      'stock', 'broth', 'canned', 'kidney bean', 'chopped tomato', 'tomato paste', 'ketchup',
      'mustard', 'mayonnaise', 'soy sauce', 'worcestershire', 'vinegar', 'olive oil',
      'vegetable oil', 'marinara', 'olive', 'pickle', 'sauerkraut', 'jam', 'syrup', 'honey',
    ],
  },
  {
    name: 'Pantry & Spices',
    keywords: [
      'salt', 'sugar', 'baking powder', 'baking soda', 'cumin', 'paprika',
      'cinnamon', 'nutmeg', 'oregano', 'cajun', 'vanilla', 'yeast', 'cocoa',
      'chocolate', 'raisin', 'gingersnap', 'juniper', 'bay leaf', 'caraway',
      // Bare/spice-form pepper and chili -- checked after Produce's more
      // specific "bell pepper" etc., so those still win first.
      'pepper', 'peppercorn', 'chili', 'chile',
    ],
  },
];

function normalize(s) {
  return String(s || '').toLowerCase().trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary matching, not plain substring -- "corn" as a bare
// keyword must not match inside "peppercorns", nor "pea" inside "pear".
// Multi-word keywords like "bell pepper" still work: \b anchors at the
// start and end of the whole phrase. The optional (es|s) lets a
// singular keyword ("noodle", "peppercorn", "olive") also match its
// regular plural ("noodles", "peppercorns", "olives") without needing
// both spelled out -- irregular plurals (berry/berries) still need both
// forms listed explicitly, same as ingredient-aliases.js.
function keywordMatches(name, keyword) {
  return new RegExp(`\\b${escapeRegExp(keyword)}(?:es|s)?\\b`, 'i').test(name);
}

function groceryCategoryFor(ingredientName) {
  const name = normalize(ingredientName);
  for (const section of SECTIONS) {
    if (section.keywords.some((kw) => keywordMatches(name, kw))) return section.name;
  }
  return 'Other';
}

// Display/sort order, with "Other" always last.
const SECTION_ORDER = [...SECTIONS.map((s) => s.name), 'Other'];

module.exports = { groceryCategoryFor, SECTION_ORDER };
