# 5. Observability: reading the results

A load test result is the **combination** of client-side numbers (k6) and server-side numbers (resource usage, app metrics).
k6 tells you *that* the system is slow; the server side tells you *why*.

Where to look:

| Where | What | When |
|---|---|---|
| Terminal | end-of-test summary, thresholds ✓/✗ | after the run |
| http://localhost:5665 | k6 live web dashboard | only while a test runs |
| `results/<testid>.html` | the same dashboard saved as a file | after the run |
| `results/<testid>-summary.json` | machine-readable summary | after the run |
| Grafana → **k6 Prometheus** | k6 metrics over time, comparable across runs | during and after |
| Grafana → **Docker Containers** | CPU and memory of every container vs its limits | always |
| Grafana → **Explore** / VictoriaMetrics UI | any raw metric, incl. QuickPizza's own `/metrics` | always |

## k6 Prometheus dashboard

Variables at the top:
- **testid**: select one or more runs. Each run has a unique id like `03-stress-20261009-153002`, printed at the start of the test output.
- **quantile_stat**: which percentile to show in the latency panels: `p50`, `p95` or `p99`.
- **adhoc_filter**: filter by any tag, e.g. `name = POST /api/pizza` or `scenario = mobile_app`.

Set the time range to cover the run (e.g. *Last 15 minutes*) and turn on auto-refresh (5 s) while a test runs.

| Panel | What to look for |
|---|---|
| Performance Overview | VUs, RPS, failures and latency on one chart. The relation between them is the story of the test. |
| HTTP requests / failures / Peak RPS / Duration | Headline numbers for the selected range |
| Iterations | Completed iterations and **dropped iterations** (open-model tests ran out of VUs) |
| HTTP Latency Timings | `blocked`, `sending`, `waiting`, `receiving`. Growing `waiting` = the server is slow; growing `blocked` = connection pool / client side issues. |
| HTTP Latency Stats | min / max / p95 / p99 |
| HTTP Request Rate | successful vs failed RPS |
| Requests by URL | per-endpoint counts and latency, grouped by the `name` tag |
| Checks | each check's success rate |

### A caveat: k6 percentiles in Grafana are cumulative

k6's Prometheus remote-write output computes trend statistics (`p95`, `p99`, `min`, `max`) over **everything since the test started**, not per time window.
- During a ramp-up these lines look smoothed and lag behind reality.
- After a spike they **never come back down**, even when the system has recovered.

To see latency per time window, use one of these:
- the k6 web dashboard (http://localhost:5665 or `results/<testid>.html`), which aggregates per period;
- QuickPizza's server-side histogram (see *Server-side metrics* below), e.g. for the pizza endpoint:
  ```promql
  histogram_quantile(0.95, sum by (le) (rate(quickpizza_server_http_request_duration_seconds_bucket{path="/api/pizza"}[30s])))
  ```

Counters and rates (`http_reqs`, `http_req_failed`, VUs) are not affected.

## Docker Containers dashboard

| Panel | Notes |
|---|---|
| CPU usage % (per container) | **100% = one full CPU core.** QuickPizza and Postgres are limited to 0.5 CPU each, so they are saturated at ~50%. k6 has no limit and can go above 100%. |
| Memory usage % of limit | Close to 100% means the next step is the OOM killer. |
| Memory usage vs limit (bytes) | Absolute usage, with the limit line |
| Current CPU % / MEM % | Snapshot of the latest values |

What to correlate:
- **Latency goes up and QuickPizza CPU is at its limit (~50%)**: the app is CPU-bound.
- **Latency goes up and `quickpizza-db` CPU is at its limit (~50%)**: the database is the bottleneck. With the default limits this is what happens first: every recommendation is written to Postgres.
- **Memory % of limit keeps climbing**: watch for an OOM kill (the container restarts; `docker compose ps` shows it).
- **Latency goes up and nothing is saturated**: look for waits (locks, connection pools, injected delays, downstream calls).
- **k6 CPU close to the host's limit**: the load generator is the bottleneck, and the results are not trustworthy. Reduce load or give Docker more CPUs.

## Server-side metrics (Explore)

In Grafana open **Explore** (compass icon) with the *VictoriaMetrics* data source, or use http://localhost:8428/vmui. Try:

```promql
# Server-side RPS per endpoint
sum by (method, path) (rate(quickpizza_server_http_requests_total[1m]))

# Server-side p95 latency per endpoint, seconds
histogram_quantile(0.95, sum by (le, path) (rate(quickpizza_server_http_request_duration_seconds_bucket[1m])))

# Server errors
sum by (status) (rate(quickpizza_server_http_requests_total{status=~"5.."}[1m]))

# Go runtime: goroutines and heap. Watch them in soak tests.
go_goroutines{job="quickpizza"}
go_memstats_heap_inuse_bytes{job="quickpizza"}

# k6 side, for comparison: p95 of POST /api/pizza, seconds
max(k6_http_req_duration_p95{name="POST /api/pizza"})
```

If client-side latency (k6) is much higher than server-side latency, time is lost *between* them: network, connection queueing, or a saturated server that cannot even accept connections in time.

## Metric naming

k6 writes metrics through Prometheus remote write:
- Counters get a `_total` suffix: `k6_http_reqs_total`, `k6_iterations_total`.
- Trends are exported as separate gauges per statistic: `k6_http_req_duration_p95`, `_p99`, `_min`, `_max`, … (set by `K6_PROMETHEUS_RW_TREND_STATS`). Durations are in **seconds**, unlike the terminal summary, which shows ms.
- Rates (`k6_http_req_failed_rate`, `k6_checks_rate`) and gauges (`k6_vus`) keep their names.

All of them carry the k6 tags (`testid`, `name`, `method`, `status`, `scenario`, `group`, …) as labels.

Telegraf container metrics are named `docker_container_cpu_*` and `docker_container_mem_*`, with the label `container_name`.
