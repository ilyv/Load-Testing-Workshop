// Stress test: what happens above normal load? Where does latency start to degrade?
import { defaultThresholds, stages } from "./lib/config.js";
import { pizzaLover } from "./lib/journeys.js";
import { waitForApp } from "./lib/quickpizza.js";

export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: stages([
        { duration: "30s", target: 50 },
        { duration: "1m", target: 50 },
        { duration: "30s", target: 100 },
        { duration: "1m", target: 100 },
        { duration: "30s", target: 200 },
        { duration: "1m", target: 200 },
        { duration: "30s", target: 0 },
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
