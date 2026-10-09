// Spike test: survive a sudden burst of users and recover after it.
import { defaultThresholds, stages } from "./lib/config.js";
import { pizzaLover } from "./lib/journeys.js";
import { waitForApp } from "./lib/quickpizza.js";

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 20,
      stages: stages([
        { duration: "30s", target: 20 },
        { duration: "10s", target: 400 },
        { duration: "1m", target: 400 },
        { duration: "10s", target: 20 },
        { duration: "1m", target: 20 },
      ]),
      gracefulRampDown: "10s",
    },
  },
  thresholds: defaultThresholds,
};

export function setup() {
  waitForApp();
}

// Impatient users: short think time, so a laptop can push QuickPizza past its limits.
export default function () {
  pizzaLover({ minThinkTime: 0.2, maxThinkTime: 0.5 });
}
