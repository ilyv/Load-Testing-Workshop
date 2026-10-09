// Soak test: does the system stay stable over time (memory leaks, growing DB, degrading latency)?
import { defaultThresholds, duration, stages } from "./lib/config.js";
import { pizzaLover } from "./lib/journeys.js";
import { waitForApp } from "./lib/quickpizza.js";

const SOAK_DURATION = __ENV.DURATION || "5m";

export const options = {
  scenarios: {
    soak: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: stages([
        { duration: "30s", target: 100 },
        { duration: SOAK_DURATION, target: 100 },
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

export default function () {
  pizzaLover();
}
