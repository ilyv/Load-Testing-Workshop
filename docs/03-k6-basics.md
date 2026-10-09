# 3. k6 basics

k6 scripts are JavaScript (ES modules); k6 itself is written in Go and runs them in its own runtime (not Node.js), so npm packages and browser APIs are not available.
Full docs: https://grafana.com/docs/k6/latest/

## Anatomy of a script

```js
import http from "k6/http";
import { check, sleep } from "k6";

// 1. init: runs once per VU. Load files, define options. No HTTP calls here.
export const options = {
  vus: 10,
  duration: "1m",
  thresholds: { http_req_duration: ["p(95)<500"] },
};

// 2. setup: runs once before the test. Its return value is passed to default() and teardown().
export function setup() {
  return { startedAt: Date.now() };
}

// 3. default (VU code): every VU runs it in a loop until the test ends. One loop = one iteration.
export default function (data) {
  const res = http.get("http://quickpizza:3333/");
  check(res, { "status is 200": (r) => r.status === 200 });
  sleep(1);
}

// 4. teardown: runs once after the test.
export function teardown(data) {}
```

## VUs, iterations and think time

- A **virtual user (VU)** is an independent JS runtime that runs your code in a loop.
- An **iteration** is one execution of the VU function.
- **Think time** (`sleep`) emulates a human pausing between actions. Without it, a single VU fires requests as fast as the server answers.

Throughput is therefore *not* the number of VUs. In our `pizzaLover` journey one iteration takes about 5 s and makes about 4.6 requests, so one VU ≈ 1 request per second.

## Executors: closed vs open model

**Executors** decide how VUs and iterations are scheduled.

| Model | Executors | How load is defined | When the system slows down… |
|---|---|---|---|
| Closed | `constant-vus`, `ramping-vus`, `per-vu-iterations`, `shared-iterations` | number of concurrent VUs | …VUs wait for responses, so the request rate **drops**. The system "protects itself" and the problem looks smaller than it is. |
| Open | `constant-arrival-rate`, `ramping-arrival-rate` | iterations per second | …k6 starts more VUs to keep the rate. If it runs out (`maxVUs`), it reports `dropped_iterations`. |

Use the open model when you know the target RPS (APIs, mobile backends, SLAs). Use the closed model to simulate a known number of concurrent users.
In this workshop, `02`–`05` are closed and `06-breakpoint.js` is open; `07-scenarios.js` mixes both.

## Checks vs thresholds

- A **check** validates one response (`status is 200`). A failed check is counted, but **does not fail the test**.
- A **threshold** is a pass/fail criterion (your SLO) over a metric for the whole run. If any threshold is crossed, k6 exits with code 99, which is what fails a CI job.

```js
thresholds: {
  http_req_failed: ["rate<0.01"],                     // less than 1% errors
  http_req_duration: ["p(95)<500", "p(99)<1000"],     // latency percentiles, ms
  checks: ["rate>0.99"],                              // 99% of checks pass
  "http_req_duration{name:POST /api/pizza}": ["p(95)<300"],    // per endpoint, via tags
}
```

A threshold can also stop the test as soon as it is crossed. [`06-breakpoint.js`](../tests/06-breakpoint.js) uses this:

```js
http_req_failed: [{ threshold: "rate<0.05", abortOnFail: true, delayAbortEval: "10s" }],
```

## Built-in metrics you will look at

| Metric | Meaning |
|---|---|
| `http_reqs` | number of requests (rate = RPS) |
| `http_req_duration` | time from sending the request to receiving the whole response (= `sending + waiting + receiving`) |
| `http_req_waiting` | time to first byte: mostly server processing time |
| `http_req_failed` | share of responses that were not "expected" (by default, not 2xx/3xx) |
| `iteration_duration` | time of one full iteration, including `sleep` |
| `vus` | active VUs |
| `dropped_iterations` | iterations an arrival-rate executor could not start (not enough VUs) |
| `checks` | share of successful checks |

## Tags and groups

Every metric sample carries **tags**: `method`, `status`, `url`, `name`, `scenario`, `group`, and more.

- `name` groups dynamic URLs (`/api/pizza/123`, `/api/pizza/456`) into one series. Our client sets it on every request, which keeps dashboards readable and the metrics DB small.
- `group("rate pizza", () => …)` adds a `group` tag and organizes the end-of-test summary.
- Every run here also gets a `testid` tag (set by `infra/k6/entrypoint.sh`). The Grafana dashboard filters on it.

## Scenarios

`options.scenarios` runs several independent workloads in one test. Each has its own executor, function (`exec`), start time and tags:

```js
scenarios: {
  browsers:   { executor: "constant-vus", vus: 50, duration: "3m", exec: "browse" },
  mobile_app: { executor: "constant-arrival-rate", rate: 50, timeUnit: "1s", duration: "3m",
                preAllocatedVUs: 20, maxVUs: 200, exec: "mobileApp", startTime: "30s" },
},
thresholds: {
  "http_req_duration{scenario:mobile_app}": ["p(95)<300"],
},
```

See [`tests/07-scenarios.js`](../tests/07-scenarios.js).

## How the tests in this repo are organized

```
tests/
  lib/config.js       BASE_URL, default thresholds, DURATION_SCALE helper
  lib/quickpizza.js   API client: one function per endpoint, with checks and name tags
  lib/journeys.js     user behavior: pizzaLover, browser, recommendOnce
  lib/users.js        test users in a SharedArray
  0X-*.js             only the load profile + thresholds
```

All load tests reuse the same user journey and only change *how much* and *how fast*. That is the point: a load test = **workload model + user behavior + pass/fail criteria**.

## Environment variables

Read them with `__ENV.NAME`; pass them with `-e NAME=value`.

| Variable | Used by | Default |
|---|---|---|
| `BASE_URL` | all | `http://quickpizza:3333`. Only hosts inside the workshop network are reachable. |
| `DURATION_SCALE` | all | `1`. Multiplies every duration; `0.1` gives a 10x shorter dry run. |
| `TEST_ID` | all | `<script>-<timestamp>` |
| `DURATION` | `05-soak.js` | `5m` |
| `MAX_RATE` | `06-breakpoint.js` | `500` iterations/s |

## What the k6 container does for you

`docker compose run --rm --use-aliases k6 <script>` runs `infra/k6/entrypoint.sh`, which calls:

```
k6 run --tag testid=<testid> --summary-export /results/<testid>-summary.json <script>
```

It also enables:
- `--out experimental-prometheus-rw` to VictoriaMetrics, with trend stats `p50, p95, p99, min, max`;
- the web dashboard on port 5665, with an HTML export to `results/<testid>.html`.

All of this is set through `K6_*` variables in `compose.yaml`.
