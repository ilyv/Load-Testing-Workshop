import { group, sleep } from "k6";
import { currentUser } from "./users.js";
import { listIngredients, login, openHomePage, ratePizza, recommendPizza } from "./quickpizza.js";

let token;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function thinkTime(min = 1, max = 3) {
  sleep(min + Math.random() * (max - min));
}

export function randomRestrictions() {
  return {
    maxCaloriesPerSlice: randomInt(500, 1000),
    mustBeVegetarian: Math.random() < 0.2,
    excludedIngredients: [],
    excludedTools: [],
    maxNumberOfToppings: randomInt(3, 6),
    minNumberOfToppings: 2,
  };
}

// Each VU logs in once and keeps its token, like a real user session.
export function ensureLoggedIn() {
  if (!token) {
    const user = currentUser();
    token = login(user.username, user.password);
  }
  return token;
}

// Visitor who opens the site, logs in, asks for a pizza and sometimes rates it.
export function pizzaLover({ minThinkTime = 1, maxThinkTime = 3 } = {}) {
  group("open home page", () => {
    openHomePage();
  });
  thinkTime(minThinkTime, maxThinkTime);

  const userToken = ensureLoggedIn();
  if (!userToken) {
    return;
  }

  let pizza;
  group("get recommendation", () => {
    pizza = recommendPizza(userToken, randomRestrictions());
  });
  thinkTime(minThinkTime, maxThinkTime);

  if (pizza && Math.random() < 0.5) {
    group("rate pizza", () => {
      ratePizza(userToken, pizza.id, randomInt(1, 5));
    });
    thinkTime(minThinkTime, maxThinkTime);
  }
}

// Visitor who only looks around without ordering.
export function browser() {
  const userToken = ensureLoggedIn();
  openHomePage();
  thinkTime(0.5, 1.5);
  if (userToken) {
    listIngredients(userToken, "topping");
  }
  thinkTime(0.5, 1.5);
}

// A single recommendation without think time: used by arrival-rate tests.
export function recommendOnce() {
  const userToken = ensureLoggedIn();
  if (userToken) {
    recommendPizza(userToken, randomRestrictions());
  }
}
