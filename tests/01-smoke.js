// Smoke test: does the script work and does the system respond correctly under minimal load?
import { defaultThresholds, duration } from "./lib/config.js";
import { pizzaLover } from "./lib/journeys.js";
import { waitForApp } from "./lib/quickpizza.js";

export const options = {
  vus: 2,
  duration: duration("30s"),
  thresholds: {
    ...defaultThresholds,
    checks: ["rate==1"],
  },
};

export function setup() {
  waitForApp();
}

export default function () {
  pizzaLover();
}
