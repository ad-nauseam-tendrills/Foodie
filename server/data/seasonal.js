'use strict';

// A hand-curated harvest calendar for the Northeastern US. There's no
// free, reliable API for "what's in season near me" by exact location, so
// this is a static, regional approximation rather than anything location-
// aware -- good enough to nudge suggestions toward fall/winter/etc.
// produce without pretending to be more precise than it is.
//
// Keywords are matched as substrings against ingredient names (e.g.
// "squash" also catches "butternut squash", "acorn squash"), so keep
// them short and generic rather than exact ingredient names.

const SEASONAL_KEYWORDS = {
  spring: [
    'asparagus', 'pea', 'radish', 'rhubarb', 'spinach', 'strawberr',
    'artichoke', 'arugula', 'scallion', 'spring onion', 'morel',
  ],
  summer: [
    'tomato', 'corn', 'zucchini', 'summer squash', 'pepper', 'cucumber',
    'eggplant', 'peach', 'blueberr', 'raspberr', 'green bean', 'basil',
    'watermelon', 'plum', 'cherry', 'nectarine', 'okra', 'melon',
  ],
  fall: [
    'apple', 'pumpkin', 'butternut squash', 'acorn squash', 'squash',
    'brussels sprout', 'cranberr', 'pear', 'sweet potato', 'cauliflower',
    'kale', 'cabbage', 'parsnip', 'turnip', 'fig', 'beet', 'mushroom',
  ],
  winter: [
    'winter squash', 'kale', 'cabbage', 'brussels sprout', 'carrot',
    'parsnip', 'turnip', 'beet', 'citrus', 'orange', 'grapefruit', 'leek',
    'potato', 'onion', 'rutabaga', 'pomegranate',
  ],
};

// Meteorological seasons, which track produce availability closer than
// astronomical (solstice/equinox) boundaries do.
function getCurrentSeason(date = new Date()) {
  const month = date.getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

function keywordsForSeason(season) {
  return SEASONAL_KEYWORDS[season] || [];
}

module.exports = { SEASONAL_KEYWORDS, getCurrentSeason, keywordsForSeason };
