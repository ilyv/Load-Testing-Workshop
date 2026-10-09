// Average-load test: how does the system behave under typical production traffic?
import { defaultThresholds, stages } from "./lib/config.js";
import { pizzaLover } from "./lib/journeys.js";
import { waitForApp } from "./lib/quickpizza.js";

export const options = {
  scenarios: {
    average_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: stages([
        { duration: "1m", target: 50 },
        { duration: "3m", target: 50 },
        { duration: "1m", target: 0 },
      ]),
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    ...defaultThresholds,
    "http_req_duration{name:POST /api/pizza}": ["p(95)<300"],
    "http_req_duration{name:POST /api/users/token/login}": ["p(95)<300"],
  },
};

export function setup() {
  waitForApp();
}

export default function () {
  pizzaLover();
}
