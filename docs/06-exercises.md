# 6. Exercises

Do them in order; each takes 10–20 minutes. Keep Grafana open (_k6 Prometheus_ plus _Docker Containers_, auto-refresh 5 s) while tests run.

---

## Exercise 1: First run and reading the summary

1. Start the stack and run the smoke test:
   ```shell
   docker compose up -d
   docker compose run --rm --use-aliases k6 01-smoke.js
   ```
2. In the terminal summary, find `http_req_duration` p95, `http_req_failed` and `iterations`.
3. Open `results/<testid>.html` in your browser.
4. In Grafana, select your `testid` and find the same numbers.

**Discuss:** why is `http_req_duration` avg much lower than p95? Which number would you put in an SLO, and why?

## Exercise 2: Break the smoke test on purpose

1. In `tests/lib/quickpizza.js`, change the expected status in `ratePizza` from `201` to `200`. Run the smoke test again.
2. What happens to `checks`? What exit code does k6 return?
   - macOS / Linux: `echo $?`
   - PowerShell: `$LASTEXITCODE`
3. Revert the change. Now set the smoke threshold to `http_req_duration: ["p(95)<10"]` and run it again.

**Discuss:** the difference between a failed check and a failed threshold. Which one fails a CI pipeline?

## Exercise 3: Average load vs your SLO

1. Run `02-average-load.js` (use `-e DURATION_SCALE=0.4` to save time).
2. Add a threshold for the ratings endpoint: `"http_req_duration{name:POST /api/ratings}": ["p(95)<200"]`.
3. Add a threshold that the home page batch (`name:GET /`) has p99 < 100 ms.

**Discuss:** why do per-endpoint thresholds matter when there is already a global one?

## Exercise 4: Find the bottleneck (stress)

1. Run `03-stress.js`.
2. On _Docker Containers_, which container hits its CPU limit first?
3. On _k6 Prometheus_, at which VU step does p95 bend upwards? Does RPS keep growing linearly with VUs?
4. Write down the max RPS you saw before latency doubled from the baseline.

**Discuss:** closed model, part 1. When the server slows down, what happens to the request rate in a VU-based test?

## Exercise 5: Capacity and the breakpoint

1. Run `06-breakpoint.js` and wait for it to abort.
2. Write down three numbers:
   - the RPS where p95 starts rising (_capacity point_);
   - the RPS at abort (_breaking point_);
   - CPU % of `quickpizza` and `quickpizza-db` at both points.
3. Which container was at its CPU limit when the test aborted? Give **that** server more "hardware": create `.env` with `DB_CPUS=1` (or `QUICKPIZZA_CPUS=1`), run `docker compose up -d`, and repeat.
4. Did capacity double? If not, which resource limits it now? Then scale the other container too and compare all three runs in Grafana: select the three testids at once.

**Discuss:** vertical scaling, Amdahl's law, and why "just add CPUs" stops working.

## Exercise 6: Faults: latency and errors

1. Turn on fault injection: 300 ms delay and 5% errors on `POST /api/pizza`.
   ```shell
   docker compose -f compose.yaml -f compose.faults.yaml up -d quickpizza
   ```
2. Run `02-average-load.js` with `-e DURATION_SCALE=0.4`. Which thresholds fail?
3. Look at _HTTP Latency Timings_. Which timing grew: `waiting` or `blocked`? Why?
4. Run `06-breakpoint.js` with faults on. Compare the VU count with the run from exercise 5: a 300 ms delay costs no CPU, so why does k6 need many more VUs for the same RPS? (Little's law: `concurrency = throughput × latency`.)
5. Turn faults off: `docker compose up -d quickpizza`.

## Exercise 7: Closed vs open model

1. Turn on faults with a big delay: `FAULT_PIZZA_DELAY=2s FAULT_PIZZA_FAIL_RATE=0`, plus the faults override, as in exercise 6. On PowerShell, set them in `.env` instead.
2. Run `02-average-load.js` (closed model). What happens to RPS when latency jumps?
3. Run `07-scenarios.js` and watch the `mobile_app` scenario (open model): VUs, `dropped_iterations`.
4. Turn faults off.

**Discuss:** which model reflects your production traffic? Users who wait for an answer, or requests that keep arriving no matter what?

## Exercise 8: Write your own scenario

Create `tests/08-my-scenario.js` with a new user type, the **pizza critic**:

- logs in (reuse `ensureLoggedIn()` from `lib/journeys.js`);
- requests 3 vegetarian pizzas in a row (`recommendPizza(token, {...randomRestrictions(), mustBeVegetarian: true})`);
- rates each of them 1 star;
- arrives at a constant rate of 5 critics per second for 2 minutes, running in parallel with 30 `pizzaLover` VUs;
- has its own threshold: p95 of its requests < 400 ms. Hint: tag the scenario and use `{scenario:critics}`.

Run it, then find your scenario in Grafana with the _adhoc_filter_.

## Bonus

- **Soak:** run `05-soak.js` with `-e DURATION=30m`. Do QuickPizza memory and `go_goroutines` stay flat? Does Postgres memory grow?
- **CI-style run:** what exit code does k6 return when thresholds fail? How would you use it in a GitLab CI job?
