# 2. QuickPizza: the system under test

[QuickPizza](https://github.com/grafana/quickpizza) is Grafana's demo app for k6. It is a small Go service with a web UI that recommends random pizzas.
In this workshop it runs as a single container (`quickpizza`, limited to **0.5 CPU / 192 MB**) backed by PostgreSQL (`quickpizza-db`, **0.5 CPU / 256 MB**).

Open http://localhost:3333 and click **Pizza, Please!** Open the browser dev tools on the Network tab while you click: the requests you see are the ones the k6 tests replay.

## API used by the tests

All calls are wrapped in [`tests/lib/quickpizza.js`](../tests/lib/quickpizza.js).

| Method & path | Auth | Purpose | Expected status |
|---|---|---|---|
| `GET /` | – | Front-end page | 200 |
| `GET /api/config`, `GET /api/quotes` | – | Data the page loads | 200 |
| `POST /api/users/token/login` | – | Log in, returns `{"token": "..."}` | 200 |
| `POST /api/pizza` | token | Get a pizza recommendation for a set of restrictions | 200 |
| `GET /api/ingredients/{type}` | token | List ingredients: `olive_oil`, `tomato`, `mozzarella`, `topping` | 200 |
| `POST /api/ratings` | token | Rate a pizza: `{"pizza_id": 1, "stars": 5}` | **201** |
| `GET /ready`, `GET /healthz` | – | Readiness / liveness | 200 |
| `GET /metrics` | – | Prometheus metrics of the server itself | 200 |

Authenticated endpoints need the header `Authorization: Token <token>`. Without it they return 401.

Try it by hand:

```shell
curl -s -X POST localhost:3333/api/users/token/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"user1","password":"quickpizza"}'

curl -s -X POST localhost:3333/api/pizza \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Token <token from above>' \
  -d '{"maxCaloriesPerSlice":800,"mustBeVegetarian":false,"excludedIngredients":[],"excludedTools":[],"maxNumberOfToppings":5,"minNumberOfToppings":2}'
```

## Test users

QuickPizza seeds 100 users: `user1` … `user100`, all with the password `quickpizza`.
They are listed in [`tests/lib/data/users.json`](../tests/lib/data/users.json) and loaded once into a k6 `SharedArray`. Each virtual user (VU) logs in as its own account (`user[vu id % 100]`) and keeps its token for the whole test, like a real browser session.

## Fault injection

QuickPizza can slow down or fail on purpose. [`compose.faults.yaml`](../compose.faults.yaml) turns this on for `POST /api/pizza`:

| Variable | Default in the override | Effect |
|---|---|---|
| `QUICKPIZZA_DELAY_RECOMMENDATIONS_API_PIZZA_POST` | `300ms` (`FAULT_PIZZA_DELAY`) | Sleeps before answering |
| `QUICKPIZZA_FAIL_RATE_RECOMMENDATIONS_API_PIZZA_POST` | `5` (`FAULT_PIZZA_FAIL_RATE`) | Fails that percentage of requests |

```shell
# turn faults on (QuickPizza restarts)
docker compose -f compose.yaml -f compose.faults.yaml up -d quickpizza

# with your own values
FAULT_PIZZA_DELAY=1s FAULT_PIZZA_FAIL_RATE=20 docker compose -f compose.yaml -f compose.faults.yaml up -d quickpizza

# back to normal
docker compose up -d quickpizza
```

On Windows PowerShell, set the variables first: `$env:FAULT_PIZZA_DELAY="1s"`. Alternatively, put them in `.env`.

See the [QuickPizza docs](https://github.com/grafana/quickpizza/blob/main/docs/inject-errors.md) for more variables, and for request headers that inject errors per request.

## Server-side metrics

VictoriaMetrics scrapes `quickpizza:3333/metrics` every 5 seconds, so you can compare what k6 sees (client side) with what the server sees.
Useful series:

- `quickpizza_server_http_requests_total{method, path, status}`
- `quickpizza_server_http_request_duration_seconds_bucket{method, path, status, le}`
- `quickpizza_server_pizza_recommendations_total`
- `go_goroutines`, `go_memstats_heap_inuse_bytes`

QuickPizza is built as a set of services (catalog, copy, recommendations, …) that talk to each other over HTTP even when they run in one container. A single `POST /api/pizza` from k6 fans out into internal calls such as `/api/ingredients/{type}`, `/api/doughs`, `/api/names`, `/api/adjectives` and `/api/internal/recommendations`. That is why the server sees several times more requests than k6 sends. It is also typical of real systems: one user action costs many backend requests.

See [05-observability.md](05-observability.md) for queries.
