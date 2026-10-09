// Breakpoint test: keep increasing the request rate until the system breaks, then stop.
import { duration } from "./lib/config.js";
import { recommendOnce } from "./lib/journeys.js";
import { waitForApp } from "./lib/quickpizza.js";

const MAX_RATE = Number(__ENV.MAX_RATE || 500);

export const options = {
  scenarios: {
    breakpoint: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 1000,
      stages: [{ duration: duration("10m"), target: MAX_RATE }],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: true, delayAbortEval: "10s" }],
    http_req_duration: [{ threshold: "p(95)<1000", abortOnFail: true, delayAbortEval: "10s" }],
  },
};

export function setup() {
  waitForApp();
}

export default function () {
  recommendOnce();
}
