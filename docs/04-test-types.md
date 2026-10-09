# 4. Test types

Every test answers a different question. They share the same user behavior ([`tests/lib/journeys.js`](../tests/lib/journeys.js)) and differ only in the **load profile** and the **pass/fail criteria**.

```
 VUs/RPS
   │            stress              spike                 breakpoint
   │          ┌──────┐              ┌┐                         ╱
   │      ┌───┘      │              ││                       ╱
   │  ┌───┘  load    └──┐           ││                     ╱
   │──┘ ─────────────── └─  ────────┘└────────          ╱
   │ smoke ─────                 soak ───────────────────────────────
   └─────────────────────────────────────────────────────────────▶ time
```

Always start with **smoke**. Never run a heavy test on a script that has not passed a smoke run.

User journey (`pizzaLover`), used by 01–05 and part of 07:
1. Open the home page: `GET /`, `/api/config`, `/api/quotes` (in parallel, like a browser).
2. Think for 1–3 s.
3. Log in, once per VU, and keep the token.
4. Get a pizza recommendation (`POST /api/pizza`).
5. Think for 1–3 s.
6. In 50% of the iterations, rate the pizza (`POST /api/ratings`).

One iteration takes about 5 s and makes about 4.6 requests, so **1 VU ≈ 1 RPS**.
Stress and spike use "impatient" users with 0.2–0.5 s think time; otherwise a laptop could not run enough VUs to reach QuickPizza's limits.

The "Expected result" notes below were observed on the default limits (QuickPizza and Postgres 0.5 CPU each) on an Apple Silicon laptop. Your numbers will differ, and that is fine.

---

## 01 Smoke: `01-smoke.js`

**Question:** Does the script work? Does the system work at all?
**Load:** 2 VUs for 30 s.
**Pass criteria:** default thresholds, and **100% of checks** must pass.
**Look at:** the terminal summary. Every check must be ✓.

## 02 Average load: `02-average-load.js`

**Question:** Does the system meet its SLOs under normal, expected traffic?
**Load:** ramp 0 → 50 VUs in 1 min, hold 3 min, ramp down 1 min (≈ 50 RPS at the peak).
**Pass criteria:**
- error rate < 1%, p95 < 500 ms, p99 < 1 s;
- per-endpoint p95: `POST /api/pizza` < 300 ms, `POST /api/users/token/login` < 300 ms.

**Look at:** latency stays flat during the hold phase. CPU of QuickPizza is well below its limit (~15% of the 50%).
**Expected result:** passes easily. p95 ≈ 100 ms.

## 03 Stress: `03-stress.js`

**Question:** How does the system behave above normal load? At which step does it start to degrade?
**Load:** steps of 50 → 100 → 200 VUs, 1 min each, with 30 s ramps.
**Pass criteria:** default thresholds. Failing them here is **information**, not a broken test.
**Look at:** *Performance Overview*. Find the step where p95 bends upwards and RPS stops growing linearly with VUs. Correlate with QuickPizza and DB CPU on *Docker Containers*.
**Expected result:** up to 100 VUs, throughput grows linearly (≈ 480 RPS) and the server-side p95 of `POST /api/pizza` stays around 190 ms. At 200 VUs, **RPS peaks at ~650 and falls back to ~500 while that p95 jumps to ~2 s**. `quickpizza-db` is pinned at its CPU limit. The `p(95)<500` threshold fails, which is the point of this test.

## 04 Spike: `04-spike.js`

**Question:** Does the system survive a sudden burst (a marketing push, a game release), and does it **recover** when the burst ends?
**Load:** 20 VUs → **400 VUs in 10 s** → hold 1 min → back to 20 VUs → observe 1 min.
**Pass criteria:** default thresholds.
**Look at:** errors and latency during the spike, and whether latency returns to the baseline afterwards. Slow recovery points to queues, leaked connections or GC pressure.
**Expected result:**
- RPS jumps from ~95 to ~700, then settles around 500 while the database is saturated.
- p95 grows from 0.09 s to ~2.4 s, and about 1.3% of requests fail: QuickPizza's internal calls time out (`context canceled` in `docker compose logs quickpizza`). The thresholds fail.
- After the spike, server-side p95 drops back to ~0.2 s within seconds.

To see recovery, use the server-side latency query from [05-observability.md](05-observability.md#a-caveat-k6-percentiles-in-grafana-are-cumulative) or the k6 web dashboard. The p95 on the k6 Grafana dashboard is cumulative and stays high.

## 05 Soak: `05-soak.js`

**Question:** Is the system stable over a long time? Look for memory leaks, a growing DB, connection leaks, and latency that creeps up.
**Load:** 100 VUs for `DURATION` (default 5 min; use hours in real life: `-e DURATION=2h`).
**Pass criteria:** default thresholds.
**Look at:** trends rather than levels. Memory of `quickpizza` and `quickpizza-db` should be flat, and so should p95. QuickPizza `go_goroutines` and `go_memstats_heap_inuse_bytes` in Explore.
**Expected result:** passes; flat memory and latency over 5 minutes.

## 06 Breakpoint: `06-breakpoint.js`

**Question:** What is the maximum throughput, and how does the system fail?
**Load:** **open model**: `ramping-arrival-rate` from 10 to `MAX_RATE` (default 500) recommendations/s over 10 min. One iteration = one `POST /api/pizza`, with no think time.
**Pass criteria:** the test **aborts** when the error rate > 5% or p95 > 1 s (`abortOnFail` with a 10 s delay).
**Look at:**
- The RPS at which latency starts rising: that is the *capacity point*.
- The RPS at which the test aborted: the *breaking point*.
- `dropped_iterations` and the VU count. In the open model, k6 adds VUs when responses slow down.

**Expected result:** server-side latency stays flat (~175 ms) up to ~230 RPS, then collapses within seconds; the test aborts on p95 > 1 s at about 250 RPS, after ~5 minutes. Both `quickpizza` and `quickpizza-db` are close to their 0.5 CPU limits at that point.

## 07 Mixed scenarios: `07-scenarios.js`

**Question:** With several kinds of users at once, does each of them meet its own SLO?
**Load:**

| Scenario | Executor | Behavior | Load |
|---|---|---|---|
| `browsers` | constant-vus | home page + ingredients, short think time | 50 VUs |
| `pizza_lovers` | ramping-vus | full journey | 0 → 30 VUs |
| `mobile_app` | constant-arrival-rate | one recommendation per iteration, starts after 30 s | 50 req/s |

**Pass criteria:** per-scenario p95 (`{scenario:browsers}` < 200 ms, `{scenario:pizza_lovers}` < 500 ms, `{scenario:mobile_app}` < 300 ms), and `dropped_iterations{scenario:mobile_app}` < 10.
**Look at:** use the *adhoc_filter* `scenario = …` on the k6 dashboard to compare the scenarios.
**Expected result:** passes. `browsers` p95 ≈ 2 ms, `pizza_lovers` ≈ 90 ms, `mobile_app` ≈ 110 ms, no dropped iterations. Use it as the baseline for [exercise 7](06-exercises.md#exercise-7-closed-vs-open-model).
