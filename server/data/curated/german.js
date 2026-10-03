'use strict';

// Hand-picked classic German dishes -- see american.js in this same
// directory for why this is curated rather than bulk-imported, and
// server/seed/seed-curated.js for how files here get loaded.

const RECIPES = [
  {
    id: 'german-sauerbraten',
    name: 'Sauerbraten',
    imageFile: 'Sauerbraten.jpg',
    category: 'Beef',
    tags: 'Comfort Food,Sunday Dinner',
    instructions:
      'Marinate the roast for at least 2 days in the refrigerator in a mixture of red wine vinegar, water, ' +
      'sliced onion, bay leaves, juniper berries, and peppercorns. Remove the roast (reserve the marinade), ' +
      'pat dry, season with salt, and sear on all sides in oil in a Dutch oven. Strain the marinade vegetables ' +
      'in, along with 2 cups of the marinade liquid, and braise covered at 325°F (165°C) until fork-tender, ' +
      'about 3 hours. Remove the roast, whisk crushed gingersnaps into the braising liquid to thicken into a ' +
      'gravy, and season with sugar to taste.',
    ingredients: [
      ['Beef Chuck Roast', '3 lb'],
      ['Red Wine Vinegar', '2 cups'],
      ['Onion', '2, sliced'],
      ['Bay Leaf', '2'],
      ['Juniper Berries', '1 tsp'],
      ['Black Peppercorns', '1 tsp'],
      ['Gingersnap Cookies', '8, crushed'],
      ['Sugar', '2 tbsp'],
      ['Vegetable Oil', '2 tbsp'],
      ['Salt', 'to taste'],
    ],
  },
  {
    id: 'german-bratwurst-mit-sauerkraut',
    name: 'Bratwurst mit Sauerkraut',
    imageFile: 'Bratwurst.jpg',
    category: 'Pork',
    tags: 'Comfort Food,Quick',
    instructions:
      'Prick the bratwurst and brown in a skillet over medium heat, then remove. In the same skillet, cook ' +
      'onion until softened, add sauerkraut, caraway seeds, and a splash of stock or beer, and simmer 15 ' +
      'minutes. Nestle the bratwurst back into the sauerkraut and cook until heated through and cooked ' +
      'through, about 10 minutes more. Serve with mustard.',
    ingredients: [
      ['Bratwurst', '6 links'],
      ['Sauerkraut', '4 cups'],
      ['Onion', '1, sliced'],
      ['Caraway Seeds', '1 tsp'],
      ['Chicken Stock', '1/2 cup'],
      ['Mustard', 'to serve'],
      ['Vegetable Oil', '1 tbsp'],
    ],
  },
  {
    id: 'german-schnitzel',
    name: 'Schnitzel',
    imageFile: 'Wiener_Schnitzel.jpg',
    category: 'Pork',
    tags: 'Comfort Food,Fried,Quick',
    instructions:
      'Pound the pork cutlets to an even thickness between sheets of plastic wrap. Season with salt and ' +
      'pepper, then dredge each in flour, dip in beaten egg, and coat in breadcrumbs, pressing to adhere. Fry ' +
      'in a generous amount of oil over medium-high heat until golden and cooked through, about 3 minutes per ' +
      'side. Drain on paper towels and serve with a squeeze of lemon.',
    ingredients: [
      ['Pork Cutlets', '4'],
      ['Flour', '1/2 cup'],
      ['Eggs', '2, beaten'],
      ['Breadcrumbs', '1.5 cups'],
      ['Lemon', '1, to serve'],
      ['Vegetable Oil', 'for frying'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'german-kartoffelsalat',
    name: 'German Potato Salad',
    imageFile: 'Kartoffelsalat.jpg',
    category: 'Side',
    tags: 'Salad,Side',
    instructions:
      'Boil the potatoes until tender, then slice while still warm. Cook bacon in a skillet until crisp; ' +
      'remove and set aside, leaving the fat in the pan. Add onion to the pan and cook until softened. Whisk ' +
      'in vinegar, a little of the potato cooking water, sugar, and mustard, and simmer briefly. Pour the warm ' +
      'dressing over the potatoes, add the bacon, and toss gently. Season with salt and pepper and finish with ' +
      'chives.',
    ingredients: [
      ['Potato', '2 lb, waxy'],
      ['Bacon', '6 slices, diced'],
      ['Onion', '1, diced'],
      ['White Vinegar', '1/3 cup'],
      ['Sugar', '1 tbsp'],
      ['Mustard', '1 tsp'],
      ['Chives', '2 tbsp, chopped'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'german-rouladen',
    name: 'Rouladen',
    imageFile: 'Roulade.JPG',
    category: 'Beef',
    tags: 'Comfort Food,Sunday Dinner',
    instructions:
      'Lay out thin beef slices and spread each with mustard. Top with a strip of bacon, chopped onion, and a ' +
      'pickle spear. Roll up tightly and secure with kitchen string or toothpicks. Sear the rolls in oil in a ' +
      'Dutch oven until browned on all sides. Add beef stock, cover, and braise until tender, about 1.5 hours. ' +
      'Remove the rolls, whisk flour into the braising liquid to thicken into a gravy, and season with salt ' +
      'and pepper.',
    ingredients: [
      ['Beef Top Round', '1.5 lb, thinly sliced'],
      ['Bacon', '6 slices'],
      ['Onion', '1, finely diced'],
      ['Dill Pickle', '3, quartered lengthwise'],
      ['Mustard', '3 tbsp'],
      ['Beef Stock', '2 cups'],
      ['Flour', '2 tbsp'],
      ['Vegetable Oil', '2 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'german-kasespatzle',
    name: 'Käsespätzle',
    imageFile: 'Käsespätzle.jpg',
    category: 'Vegetarian',
    tags: 'Comfort Food,Casserole',
    instructions:
      'Cook spätzle in salted boiling water until they float, about 2 minutes; drain. Cook onions slowly in ' +
      'butter until deeply caramelized, about 20 minutes. Layer the spätzle and grated cheese in a baking dish ' +
      'in batches, finishing with cheese on top. Warm through in a low oven or covered on the stovetop until ' +
      'the cheese melts, then top with the caramelized onions to serve.',
    ingredients: [
      ['Spätzle', '1.5 lb'],
      ['Gruyère Cheese', '2 cups, grated'],
      ['Onion', '3, thinly sliced'],
      ['Butter', '3 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'german-kartoffelpuffer',
    name: 'Kartoffelpuffer (Potato Pancakes)',
    imageFile: 'Kartoffelpuffer.jpg',
    category: 'Vegetarian',
    tags: 'Fried,Quick,Vegetarian',
    instructions:
      'Grate the potatoes and onion, then squeeze out as much liquid as possible in a clean kitchen towel. Mix ' +
      'with egg, flour, salt, and pepper. Heat oil in a skillet and drop in spoonfuls of the mixture, ' +
      'flattening slightly. Fry until golden and crisp, about 3 minutes per side. Drain on paper towels and ' +
      'serve with applesauce or sour cream.',
    ingredients: [
      ['Potato', '4, peeled'],
      ['Onion', '1'],
      ['Eggs', '2'],
      ['Flour', '3 tbsp'],
      ['Vegetable Oil', 'for frying'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'german-rotkohl',
    name: 'Rotkohl (Braised Red Cabbage)',
    imageFile: 'Rindergulasch_Rotkohl_Kloesse_001.JPG',
    category: 'Side',
    tags: 'Side,Vegetarian',
    instructions:
      'Cook onion in butter in a large pot until softened. Add shredded red cabbage, apple, vinegar, sugar, ' +
      'and a splash of water. Cover and simmer, stirring occasionally, until the cabbage is tender, about 45 ' +
      'minutes. Season with salt and pepper, and add a touch more vinegar or sugar to balance to taste.',
    ingredients: [
      ['Red Cabbage', '1 head, shredded'],
      ['Apple', '2, peeled and diced'],
      ['Onion', '1, diced'],
      ['Red Wine Vinegar', '3 tbsp'],
      ['Sugar', '2 tbsp'],
      ['Butter', '2 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'german-linsensuppe',
    name: 'Linsensuppe (Lentil Soup)',
    imageFile: 'Bowl_of_lentil_soup_with_green_and_red_lentils.jpg',
    category: 'Soup',
    tags: 'Soup,Comfort Food',
    instructions:
      'Cook diced bacon in a large pot until the fat renders. Add onion, carrot, and celery, and cook until ' +
      'softened. Stir in lentils, stock, and bay leaf; simmer until the lentils are tender, about 30 minutes. ' +
      'Add sliced sausage in the last 10 minutes to heat through. Stir in a splash of vinegar, season with ' +
      'salt and pepper, and serve.',
    ingredients: [
      ['Brown Lentils', '2 cups'],
      ['Bacon', '4 slices, diced'],
      ['Smoked Sausage', '8 oz, sliced'],
      ['Onion', '1, diced'],
      ['Carrot', '2, diced'],
      ['Celery', '2 stalks, diced'],
      ['Vegetable Stock', '6 cups'],
      ['Bay Leaf', '1'],
      ['White Vinegar', '1 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'german-frikadellen',
    name: 'Frikadellen',
    imageFile: 'Frikadelle_(28082008).JPG',
    category: 'Beef',
    tags: 'Comfort Food,Quick',
    instructions:
      'Soak a slice of bread in milk, then squeeze out the excess and combine in a bowl with ground beef, ' +
      'ground pork, egg, finely diced onion, mustard, salt, and pepper; mix gently. Shape into flattened ' +
      'patties. Fry in oil over medium heat until golden and cooked through, about 5 minutes per side.',
    ingredients: [
      ['Ground Beef', '1 lb'],
      ['Ground Pork', '1/2 lb'],
      ['Bread', '1 slice'],
      ['Milk', '3 tbsp'],
      ['Eggs', '1'],
      ['Onion', '1, finely diced'],
      ['Mustard', '1 tbsp'],
      ['Vegetable Oil', '2 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'german-black-forest-cake',
    name: 'Black Forest Cake',
    imageFile: 'Eine_Schwarzwälder_Kirschtorte.jpg',
    category: 'Dessert',
    tags: 'Dessert,Baking',
    instructions:
      'Bake two chocolate sponge layers and let cool completely. Simmer pitted cherries with sugar and a ' +
      'splash of kirsch until slightly thickened; cool. Whip cream with a little sugar until soft peaks form. ' +
      'Brush each cake layer with kirsch, then layer with whipped cream and the cherry mixture, stacking and ' +
      'finishing with a final layer of whipped cream. Decorate with chocolate shavings and whole cherries.',
    ingredients: [
      ['Chocolate Sponge Cake', '2 layers, baked'],
      ['Cherries', '3 cups, pitted'],
      ['Sugar', '1/2 cup'],
      ['Kirsch', '3 tbsp'],
      ['Heavy Cream', '2 cups'],
      ['Dark Chocolate', '1/2 cup, shaved'],
    ],
  },
  {
    id: 'german-bauernfruhstuck',
    name: 'Bauernfrühstück (Farmer\'s Breakfast)',
    imageFile: 'Bauernfrühstück-01.jpg',
    category: 'Breakfast',
    tags: 'Breakfast,Quick',
    instructions:
      'Fry diced bacon in a large skillet until crisp; remove and set aside. Add sliced boiled potatoes to the ' +
      'skillet and fry until golden. Add onion and cook until softened. Return the bacon to the pan, pour in ' +
      'beaten eggs, and cook, stirring gently, until just set, like a loose scramble. Season with salt, ' +
      'pepper, and chives.',
    ingredients: [
      ['Potato', '4, boiled and sliced'],
      ['Bacon', '6 slices, diced'],
      ['Onion', '1, diced'],
      ['Eggs', '6, beaten'],
      ['Chives', '2 tbsp, chopped'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
];

module.exports = { area: 'German', recipes: RECIPES };
