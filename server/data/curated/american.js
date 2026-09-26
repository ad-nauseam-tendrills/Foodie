'use strict';

// A small, hand-curated set of classic American home-cooking dishes --
// exactly the gap TheMealDB has (it skews international/pub-style and is
// thin on things like chicken noodle soup or chicken and biscuits).
//
// Deliberately NOT a bulk scrape: one solid version of each dish, chosen
// by hand, rather than thousands of near-duplicate variants. Add more
// entries here any time a specific dish is missing -- that's the whole
// point of keeping this curated instead of imported in bulk. Every file
// in this directory is picked up automatically by
// server/seed/seed-curated.js -- see that file for the shape each one
// needs to export.
//
// `id` is a stable slug used as the external_id for upserts, so editing
// a recipe here and re-running the seed updates it in place rather than
// creating a duplicate.

const RECIPES = [
  {
    id: 'american-chicken-noodle-soup',
    name: 'Chicken Noodle Soup',
    imageFile: 'Chicken_noodle_soup.jpg',
    category: 'Soup',
    tags: 'Soup,Comfort Food,Chicken',
    instructions:
      'Melt butter in a large pot over medium heat. Add onion, carrot, and celery; cook until softened, ' +
      'about 8 minutes. Add garlic and cook 1 minute more. Pour in chicken stock and add the chicken breasts. ' +
      'Bring to a boil, then reduce heat and simmer until the chicken is cooked through, about 15 minutes. ' +
      'Remove the chicken, shred it with two forks, and return it to the pot. Add the egg noodles and cook ' +
      'until tender, about 8 minutes. Stir in parsley, season with salt and pepper, and serve hot.',
    ingredients: [
      ['Chicken Breast', '1.5 lb, boneless'],
      ['Chicken Stock', '8 cups'],
      ['Egg Noodles', '2 cups'],
      ['Carrot', '2, sliced'],
      ['Celery', '2 stalks, sliced'],
      ['Onion', '1, diced'],
      ['Garlic', '2 cloves, minced'],
      ['Butter', '2 tbsp'],
      ['Parsley', '2 tbsp, chopped'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-chicken-and-biscuits',
    name: 'Chicken and Biscuits',
    category: 'Chicken',
    tags: 'Comfort Food,Casserole',
    instructions:
      'Melt butter in a large skillet over medium heat. Add onion, carrot, and celery; cook until softened, ' +
      'about 8 minutes. Stir in flour and cook 1 minute. Gradually whisk in chicken stock and milk until ' +
      'smooth, then simmer until thickened, about 5 minutes. Stir in shredded chicken, peas, thyme, salt, and ' +
      'pepper. Pour into a baking dish. Arrange biscuit dough rounds on top and bake at 400°F (200°C) until ' +
      'the biscuits are golden and the filling is bubbling, about 20 minutes.',
    ingredients: [
      ['Chicken Breast', '3 cups, cooked and shredded'],
      ['Chicken Stock', '2 cups'],
      ['Milk', '1 cup'],
      ['Flour', '1/3 cup'],
      ['Butter', '4 tbsp'],
      ['Carrot', '2, diced'],
      ['Celery', '2 stalks, diced'],
      ['Onion', '1, diced'],
      ['Frozen Peas', '1 cup'],
      ['Thyme', '1 tsp'],
      ['Refrigerated Biscuit Dough', '1 can'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-meatloaf',
    name: 'Classic Meatloaf',
    imageFile: 'MeatloafWithSauce.jpg',
    category: 'Beef',
    tags: 'Comfort Food,Baking',
    instructions:
      'Preheat oven to 350°F (175°C). In a large bowl, combine ground beef, breadcrumbs, milk, egg, onion, ' +
      'garlic, Worcestershire sauce, salt, and pepper; mix gently until just combined. Shape into a loaf and ' +
      'place in a baking dish. Mix ketchup, brown sugar, and mustard, and spread half over the top. Bake 45 ' +
      'minutes, then top with the remaining glaze and bake until cooked through, about 15 minutes more. Rest ' +
      '10 minutes before slicing.',
    ingredients: [
      ['Ground Beef', '2 lb'],
      ['Breadcrumbs', '1 cup'],
      ['Milk', '1/2 cup'],
      ['Eggs', '2'],
      ['Onion', '1, finely diced'],
      ['Garlic', '2 cloves, minced'],
      ['Worcestershire Sauce', '1 tbsp'],
      ['Ketchup', '1/2 cup'],
      ['Brown Sugar', '2 tbsp'],
      ['Mustard', '1 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-baked-mac-and-cheese',
    name: 'Baked Mac and Cheese',
    imageFile: 'Baked_macaroni_and_cheese_close-up.jpg',
    category: 'Vegetarian',
    tags: 'Comfort Food,Casserole,Baking',
    instructions:
      'Preheat oven to 375°F (190°C). Cook macaroni in salted boiling water until just shy of al dente; drain. ' +
      'Melt butter in a saucepan, whisk in flour, and cook 1 minute. Gradually whisk in milk and cook until ' +
      'thickened. Remove from heat and stir in most of the cheddar and the mustard until smooth. Combine with ' +
      'the macaroni, season with salt and pepper, and pour into a baking dish. Top with remaining cheese and ' +
      'breadcrumbs. Bake until golden and bubbling, about 25 minutes.',
    ingredients: [
      ['Macaroni', '1 lb'],
      ['Cheddar Cheese', '4 cups, shredded'],
      ['Milk', '3 cups'],
      ['Butter', '4 tbsp'],
      ['Flour', '4 tbsp'],
      ['Mustard', '1 tsp'],
      ['Breadcrumbs', '1/2 cup'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-pot-roast',
    name: 'Sunday Pot Roast',
    imageFile: 'American_pot_roast.jpg',
    category: 'Beef',
    tags: 'Comfort Food,Sunday Dinner',
    instructions:
      'Season the roast with salt and pepper. Heat oil in a large Dutch oven over high heat and sear the roast ' +
      'on all sides until browned, about 8 minutes total. Remove the roast and add onion, carrot, and celery; ' +
      'cook until starting to soften, about 5 minutes. Stir in garlic and tomato paste, then return the roast ' +
      'to the pot with beef stock and thyme. Cover and braise at 325°F (165°C) for 3 hours, adding the ' +
      'potatoes for the final hour, until the meat is fork-tender.',
    ingredients: [
      ['Beef Chuck Roast', '3 lb'],
      ['Potato', '4, quartered'],
      ['Carrot', '4, cut into chunks'],
      ['Celery', '2 stalks, cut into chunks'],
      ['Onion', '1, quartered'],
      ['Garlic', '3 cloves, minced'],
      ['Beef Stock', '3 cups'],
      ['Tomato Paste', '2 tbsp'],
      ['Thyme', '1 tsp'],
      ['Vegetable Oil', '2 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-beef-stew',
    name: 'Hearty Beef Stew',
    imageFile: 'Beef_stew.jpg',
    category: 'Beef',
    tags: 'Comfort Food,Stew',
    instructions:
      'Toss beef cubes with flour, salt, and pepper. Heat oil in a large pot and brown the beef in batches; ' +
      'set aside. Add onion, carrot, and celery to the pot and cook until softened. Stir in garlic and tomato ' +
      'paste, then return the beef to the pot with beef stock, potatoes, and bay leaf. Simmer, covered, until ' +
      'the beef is tender, about 1.5 hours. Stir in frozen peas in the last 5 minutes and adjust seasoning.',
    ingredients: [
      ['Beef Chuck Roast', '2 lb, cubed'],
      ['Potato', '3, cubed'],
      ['Carrot', '3, sliced'],
      ['Celery', '2 stalks, sliced'],
      ['Onion', '1, diced'],
      ['Garlic', '2 cloves, minced'],
      ['Beef Stock', '4 cups'],
      ['Tomato Paste', '2 tbsp'],
      ['Flour', '3 tbsp'],
      ['Bay Leaf', '1'],
      ['Frozen Peas', '1 cup'],
      ['Vegetable Oil', '2 tbsp'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-chili-con-carne',
    name: 'Chili con Carne',
    imageFile: 'Chili_con_carne_(4431800858).jpg',
    category: 'Beef',
    tags: 'Comfort Food,Spicy',
    instructions:
      'Brown ground beef in a large pot over medium-high heat; drain excess fat. Add onion and bell pepper, ' +
      'and cook until softened. Stir in garlic, chili powder, and cumin, and cook 1 minute. Add kidney beans, ' +
      'tomatoes, and beef stock. Simmer, uncovered, stirring occasionally, until thickened, about 45 minutes. ' +
      'Season with salt and pepper and serve with your favorite toppings.',
    ingredients: [
      ['Ground Beef', '2 lb'],
      ['Kidney Beans', '2 cans'],
      ['Chopped Tomatoes', '2 cans'],
      ['Onion', '1, diced'],
      ['Bell Pepper', '1, diced'],
      ['Garlic', '3 cloves, minced'],
      ['Chili Powder', '2 tbsp'],
      ['Cumin', '1 tbsp'],
      ['Beef Stock', '1 cup'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-sloppy-joes',
    name: 'Sloppy Joes',
    imageFile: 'Millburn_Deli_Sloppy_Joes.jpg',
    category: 'Beef',
    tags: 'Comfort Food,Quick',
    instructions:
      'Brown ground beef with onion and bell pepper in a skillet over medium-high heat until the beef is ' +
      'cooked through; drain excess fat. Stir in garlic, ketchup, Worcestershire sauce, brown sugar, and ' +
      'mustard. Simmer until thickened, about 10 minutes. Season with salt and pepper and spoon onto toasted ' +
      'hamburger buns.',
    ingredients: [
      ['Ground Beef', '1.5 lb'],
      ['Onion', '1, diced'],
      ['Bell Pepper', '1, diced'],
      ['Garlic', '2 cloves, minced'],
      ['Ketchup', '1 cup'],
      ['Worcestershire Sauce', '1 tbsp'],
      ['Brown Sugar', '1 tbsp'],
      ['Mustard', '1 tsp'],
      ['Hamburger Buns', '6'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-tuna-noodle-casserole',
    name: 'Tuna Noodle Casserole',
    imageFile: 'Tuna_Casserole2.jpg',
    category: 'Seafood',
    tags: 'Comfort Food,Casserole,Baking',
    instructions:
      'Preheat oven to 375°F (190°C). Cook egg noodles until al dente; drain. In a bowl, mix cream of mushroom ' +
      'soup, milk, tuna, peas, and half the cheddar; fold in the noodles. Season with salt and pepper, pour ' +
      'into a baking dish, and top with remaining cheddar and breadcrumbs. Bake until golden and bubbling, ' +
      'about 25 minutes.',
    ingredients: [
      ['Egg Noodles', '3 cups'],
      ['Tuna', '2 cans, drained'],
      ['Cream of Mushroom Soup', '2 cans'],
      ['Milk', '1/2 cup'],
      ['Frozen Peas', '1 cup'],
      ['Cheddar Cheese', '1.5 cups, shredded'],
      ['Breadcrumbs', '1/2 cup'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-biscuits-and-sausage-gravy',
    name: 'Biscuits and Sausage Gravy',
    imageFile: 'American_biscuits_and_gravy.jpg',
    category: 'Breakfast',
    tags: 'Comfort Food,Southern',
    instructions:
      'Bake biscuits according to package or recipe instructions. Meanwhile, cook sausage in a skillet over ' +
      'medium heat, breaking it up, until browned. Sprinkle in flour and cook 1 minute. Gradually whisk in ' +
      'milk and simmer until thickened, about 5 minutes. Season generously with black pepper and salt. Split ' +
      'the warm biscuits and ladle the gravy over top.',
    ingredients: [
      ['Breakfast Sausage', '1 lb'],
      ['Flour', '1/4 cup'],
      ['Milk', '3 cups'],
      ['Refrigerated Biscuit Dough', '1 can'],
      ['Salt', 'to taste'],
      ['Black Pepper', '1 tsp, or to taste'],
    ],
  },
  {
    id: 'american-shepherds-pie',
    name: "Shepherd's Pie",
    imageFile: 'Shepherds_pie.JPG',
    category: 'Beef',
    tags: 'Comfort Food,Casserole,Baking',
    instructions:
      'Boil potatoes until tender, then mash with butter and milk; season with salt and pepper. Meanwhile, ' +
      'brown ground beef with onion and carrot in a skillet; drain excess fat. Stir in garlic, tomato paste, ' +
      'Worcestershire sauce, and beef stock; simmer until thickened, then stir in peas. Spread the meat ' +
      'mixture in a baking dish, top with mashed potatoes, and bake at 400°F (200°C) until golden, about 20 ' +
      'minutes.',
    ingredients: [
      ['Ground Beef', '1.5 lb'],
      ['Potato', '2 lb, peeled and chopped'],
      ['Butter', '3 tbsp'],
      ['Milk', '1/4 cup'],
      ['Onion', '1, diced'],
      ['Carrot', '2, diced'],
      ['Garlic', '2 cloves, minced'],
      ['Tomato Paste', '2 tbsp'],
      ['Worcestershire Sauce', '1 tbsp'],
      ['Beef Stock', '1 cup'],
      ['Frozen Peas', '1 cup'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-cornbread',
    name: 'Skillet Cornbread',
    imageFile: 'Skillet_cornbread.jpg',
    category: 'Side',
    tags: 'Baking,Southern',
    instructions:
      'Preheat oven to 400°F (200°C) with a cast iron skillet inside. Whisk together cornmeal, flour, sugar, ' +
      'baking powder, and salt. In another bowl, whisk buttermilk, eggs, and melted butter. Combine wet and ' +
      'dry ingredients until just mixed. Carefully remove the hot skillet, add a little butter to coat, pour ' +
      'in the batter, and bake until golden and a toothpick comes out clean, about 20 minutes.',
    ingredients: [
      ['Cornmeal', '1 cup'],
      ['Flour', '1 cup'],
      ['Sugar', '1/3 cup'],
      ['Baking Powder', '1 tbsp'],
      ['Salt', '1/2 tsp'],
      ['Buttermilk', '1 cup'],
      ['Eggs', '2'],
      ['Butter', '4 tbsp, melted'],
    ],
  },
  {
    id: 'american-chicken-pot-pie',
    name: 'Chicken Pot Pie',
    imageFile: 'Chicken_Pot_Pie.jpg',
    category: 'Chicken',
    tags: 'Comfort Food,Baking',
    instructions:
      'Melt butter in a large skillet over medium heat. Add onion, carrot, and celery; cook until softened. ' +
      'Stir in flour and cook 1 minute, then gradually whisk in chicken stock and milk; simmer until thickened. ' +
      'Stir in shredded chicken, peas, thyme, salt, and pepper. Pour into a pie dish, cover with pie crust, ' +
      'cut a few vents, and bake at 400°F (200°C) until the crust is golden, about 30 minutes.',
    ingredients: [
      ['Chicken Breast', '3 cups, cooked and shredded'],
      ['Chicken Stock', '1.5 cups'],
      ['Milk', '1/2 cup'],
      ['Flour', '1/3 cup'],
      ['Butter', '4 tbsp'],
      ['Carrot', '2, diced'],
      ['Celery', '2 stalks, diced'],
      ['Onion', '1, diced'],
      ['Frozen Peas', '1 cup'],
      ['Thyme', '1 tsp'],
      ['Pie Crust', '2 sheets'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-green-bean-casserole',
    name: 'Green Bean Casserole',
    imageFile: 'Green_bean_casserole.jpg',
    category: 'Side',
    tags: 'Comfort Food,Casserole,Baking,Vegetarian',
    instructions:
      'Preheat oven to 350°F (175°C). Combine green beans, cream of mushroom soup, milk, soy sauce, and black ' +
      'pepper in a baking dish; stir in half the fried onions. Bake for 25 minutes, stir, then top with the ' +
      'remaining fried onions and bake until golden, about 5 minutes more.',
    ingredients: [
      ['Green Beans', '4 cups'],
      ['Cream of Mushroom Soup', '2 cans'],
      ['Milk', '1/2 cup'],
      ['Soy Sauce', '1 tsp'],
      ['Fried Onions', '1.5 cups'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-new-england-clam-chowder',
    name: 'New England Clam Chowder',
    imageFile: 'Quincy_Market_-_Boston_Chowda_clam_chowder.jpg',
    category: 'Seafood',
    tags: 'Soup,Comfort Food',
    instructions:
      'Cook bacon in a large pot until crisp; remove and set aside, leaving the fat in the pot. Add onion and ' +
      'celery and cook until softened. Stir in flour and cook 1 minute. Gradually whisk in clam juice and add ' +
      'potatoes; simmer until the potatoes are tender, about 15 minutes. Stir in clams, milk, and cream; heat ' +
      'through without boiling. Season with salt and pepper and top with the crispy bacon.',
    ingredients: [
      ['Clams', '4 cans, with juice'],
      ['Potato', '3, diced'],
      ['Onion', '1, diced'],
      ['Celery', '2 stalks, diced'],
      ['Bacon', '4 slices, diced'],
      ['Flour', '3 tbsp'],
      ['Milk', '2 cups'],
      ['Heavy Cream', '1 cup'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-baked-ziti',
    name: 'Baked Ziti',
    imageFile: 'Baked_Ziti.jpg',
    category: 'Pasta',
    tags: 'Comfort Food,Casserole,Baking,Italian-American',
    instructions:
      'Preheat oven to 375°F (190°C). Cook ziti until just shy of al dente; drain. Brown ground beef with ' +
      'onion and garlic; drain excess fat, then stir in marinara sauce and simmer 5 minutes. Combine ricotta, ' +
      'half the mozzarella, and the Parmesan with the pasta and meat sauce. Pour into a baking dish, top with ' +
      'remaining mozzarella, and bake until bubbling and golden, about 25 minutes.',
    ingredients: [
      ['Ziti', '1 lb'],
      ['Ground Beef', '1 lb'],
      ['Marinara Sauce', '4 cups'],
      ['Ricotta Cheese', '1.5 cups'],
      ['Mozzarella Cheese', '2.5 cups, shredded'],
      ['Parmesan Cheese', '1/2 cup, grated'],
      ['Onion', '1, diced'],
      ['Garlic', '2 cloves, minced'],
      ['Salt', 'to taste'],
      ['Black Pepper', 'to taste'],
    ],
  },
  {
    id: 'american-apple-pie',
    name: 'Classic Apple Pie',
    imageFile: 'Apple_pie.jpg',
    category: 'Dessert',
    tags: 'Dessert,Baking',
    instructions:
      'Preheat oven to 425°F (220°C). Toss sliced apples with sugar, brown sugar, cinnamon, nutmeg, lemon ' +
      'juice, and flour. Line a pie dish with one crust, add the apple filling, dot with butter, and cover ' +
      'with the second crust; crimp the edges and cut a few vents. Bake 20 minutes, then reduce heat to 350°F ' +
      '(175°C) and bake until the filling bubbles and the crust is golden, about 35 minutes more. Cool before ' +
      'slicing.',
    ingredients: [
      ['Apple', '6, peeled and sliced'],
      ['Sugar', '1/2 cup'],
      ['Brown Sugar', '1/4 cup'],
      ['Cinnamon', '1 tsp'],
      ['Nutmeg', '1/4 tsp'],
      ['Lemon Juice', '1 tbsp'],
      ['Flour', '3 tbsp'],
      ['Butter', '2 tbsp'],
      ['Pie Crust', '2 sheets'],
    ],
  },
  {
    id: 'american-buttermilk-pancakes',
    name: 'Buttermilk Pancakes',
    imageFile: 'Buttermilk_pancakes_from_a_recipe_by_Darina_Allen.jpg',
    category: 'Breakfast',
    tags: 'Breakfast,Quick,Vegetarian',
    instructions:
      'Whisk together flour, sugar, baking powder, baking soda, and salt. In another bowl, whisk buttermilk, ' +
      'eggs, and melted butter. Combine wet and dry ingredients until just mixed (a few lumps are fine). Cook ' +
      'spoonfuls of batter on a buttered griddle over medium heat until bubbles form on top, then flip and ' +
      'cook until golden. Serve with butter and maple syrup.',
    ingredients: [
      ['Flour', '2 cups'],
      ['Sugar', '2 tbsp'],
      ['Baking Powder', '2 tsp'],
      ['Baking Soda', '1/2 tsp'],
      ['Salt', '1/2 tsp'],
      ['Buttermilk', '2 cups'],
      ['Eggs', '2'],
      ['Butter', '3 tbsp, melted'],
      ['Maple Syrup', 'to serve'],
    ],
  },
  {
    id: 'american-jambalaya',
    name: 'Chicken and Sausage Jambalaya',
    imageFile: 'Jambalaya.jpg',
    category: 'Chicken',
    tags: 'Comfort Food,Southern,Spicy',
    instructions:
      'Heat oil in a large pot and brown the sausage; remove and set aside. Add chicken and cook until browned, ' +
      'then remove. Add onion, bell pepper, and celery to the pot and cook until softened. Stir in garlic, ' +
      'Cajun seasoning, and tomato paste, then add rice, chopped tomatoes, and chicken stock. Return the ' +
      'chicken and sausage to the pot, bring to a boil, then cover and simmer until the rice is tender, about ' +
      '25 minutes.',
    ingredients: [
      ['Chicken Breast', '1 lb, cubed'],
      ['Andouille Sausage', '12 oz, sliced'],
      ['Rice', '2 cups'],
      ['Chopped Tomatoes', '1 can'],
      ['Chicken Stock', '3 cups'],
      ['Onion', '1, diced'],
      ['Bell Pepper', '1, diced'],
      ['Celery', '2 stalks, diced'],
      ['Garlic', '3 cloves, minced'],
      ['Cajun Seasoning', '2 tbsp'],
      ['Tomato Paste', '1 tbsp'],
      ['Vegetable Oil', '2 tbsp'],
    ],
  },
];

module.exports = { area: 'American', recipes: RECIPES };
