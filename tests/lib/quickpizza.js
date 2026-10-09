import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL } from "./config.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function authHeaders(token) {
  return { ...JSON_HEADERS, Authorization: `Token ${token}` };
}

function jsonField(res, field) {
  try {
    return res.json(field);
  } catch (e) {
    return undefined;
  }
}

export function openHomePage() {
  const responses = http.batch([
    ["GET", `${BASE_URL}/`, null, { tags: { name: "GET /" } }],
    ["GET", `${BASE_URL}/api/config`, null, { tags: { name: "GET /api/config" } }],
    ["GET", `${BASE_URL}/api/quotes`, null, { tags: { name: "GET /api/quotes" } }],
  ]);
  check(responses[0], { "home page: status 200": (r) => r.status === 200 });
  check(responses[2], { "quotes: status 200": (r) => r.status === 200 });
}

export function login(username, password) {
  const res = http.post(
    `${BASE_URL}/api/users/token/login`,
    JSON.stringify({ username, password }),
    { headers: JSON_HEADERS, tags: { name: "POST /api/users/token/login" } },
  );
  const token = jsonField(res, "token");
  check(res, {
    "login: status 200": (r) => r.status === 200,
    "login: got token": () => Boolean(token),
  });
  return token;
}

export function listIngredients(token, type) {
  const res = http.get(`${BASE_URL}/api/ingredients/${type}`, {
    headers: authHeaders(token),
    tags: { name: "GET /api/ingredients/{type}" },
  });
  check(res, { "ingredients: status 200": (r) => r.status === 200 });
  return jsonField(res, "ingredients") || [];
}

export function recommendPizza(token, restrictions) {
  const res = http.post(`${BASE_URL}/api/pizza`, JSON.stringify(restrictions), {
    headers: authHeaders(token),
    tags: { name: "POST /api/pizza" },
  });
  const pizza = jsonField(res, "pizza");
  check(res, {
    "recommend: status 200": (r) => r.status === 200,
    "recommend: has ingredients": () => Boolean(pizza && pizza.ingredients.length > 0),
  });
  return pizza;
}

export function ratePizza(token, pizzaId, stars) {
  const res = http.post(
    `${BASE_URL}/api/ratings`,
    JSON.stringify({ pizza_id: pizzaId, stars }),
    { headers: authHeaders(token), tags: { name: "POST /api/ratings" } },
  );
  check(res, { "rate: status 201": (r) => r.status === 201 });
}

export function waitForApp(timeoutSeconds = 60) {
  for (let i = 0; i < timeoutSeconds; i++) {
    const res = http.get(`${BASE_URL}/ready`, { tags: { name: "GET /ready" } });
    if (res.status === 200) {
      return;
    }
    sleep(1);
  }
  throw new Error(`QuickPizza is not ready at ${BASE_URL}`);
}
