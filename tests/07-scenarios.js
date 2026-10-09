// Mixed workload: several user types at once, each with its own load model and SLO.
import { defaultThresholds, duration } from "./lib/config.js";
import { browser, pizzaLover, recommendOnce } from "./lib/journeys.js";
import { waitForApp } from "./lib/quickpizza.js";

export const options = {
  scenarios: {
    browsers: {
      executor: "constant-vus",
      exec: "browse",
      vus: 50,
      duration: duration("3m"),
    },
    pizza_lovers: {
      executor: "ramping-vus",
      exec: "orderPizza",
      startVUs: 0,
      stages: [
        { duration: duration("1m"), target: 30 },
        { duration: duration("2m"), target: 30 },
      ],
    },
    mobile_app: {
      executor: "constant-arrival-rate",
      exec: "mobileApp",
      rate: 50,
      timeUnit: "1s",
      duration: duration("3m"),
      preAllocatedVUs: 20,
      maxVUs: 200,
      startTime: duration("30s"),
    },
  },
  thresholds: {
    ...defaultThresholds,
    "http_req_duration{scenario:browsers}": ["p(95)<200"],
    "http_req_duration{scenario:pizza_lovers}": ["p(95)<500"],
    "http_req_duration{scenario:mobile_app}": ["p(95)<300"],
    "dropped_iterations{scenario:mobile_app}": ["count<10"],
  },
};

export function setup() {
  waitForApp();
}

export function browse() {
  browser();
}

export function orderPizza() {
  pizzaLover();
}

export function mobileApp() {
  recommendOnce();
}
