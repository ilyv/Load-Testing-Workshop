# 1. Setup

## Install Docker

| OS | What to install | Notes |
|---|---|---|
| macOS (Intel or Apple Silicon) | [Docker Desktop](https://docs.docker.com/desktop/setup/install/mac-install/) | All images are multi-arch, nothing runs under emulation. |
| Windows 10/11 | [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) with the **WSL 2 backend** | Run the commands in PowerShell, Windows Terminal or a WSL shell. |
| Linux | [Docker Engine](https://docs.docker.com/engine/install/) + [Compose plugin](https://docs.docker.com/compose/install/linux/) | Add yourself to the `docker` group or prefix commands with `sudo`. |

Docker Compose **v2.20 or newer** is required. Check it with:

```shell
docker compose version
```

### Give Docker enough resources

The stack is capped at about 2 CPUs and 1.1 GB of RAM (see the limits below) and uses about 0.5 GB when idle. k6 needs up to 0.3 CPU and 0.3 GB on top of that in the heaviest tests.
On Docker Desktop, open **Settings → Resources** and give Docker at least **2 CPUs and 3 GB of memory**. 4 CPUs is more comfortable.
On Linux, Docker uses the host directly, so no setting is needed.

## Get the repository and pull images

```shell
git clone <this repo> load-testing-workshop
cd load-testing-workshop
docker compose --profile k6 pull
```

Do this **before** the workshop: the images take about 3 GB on disk, and conference Wi-Fi will not thank you.

> Windows: clone with Git for Windows or inside WSL. `.gitattributes` forces LF line endings, so shell and config files work in Linux containers whatever your `core.autocrlf` setting.

## Start the stack

```shell
docker compose up -d
docker compose ps
```

All services should be `running`; `quickpizza-db`, `victoriametrics` and `grafana` should also be `healthy`. Then check:

- http://localhost:3333 shows QuickPizza. Click **Pizza, Please!** to get a recommendation.
- http://localhost:3000 opens Grafana on the *k6 Prometheus* dashboard. It is empty until you run a test.
- http://localhost:3000/d/docker-containers shows CPU and memory of the workshop containers right away.

## Run the first test

```shell
docker compose run --rm --use-aliases k6 01-smoke.js
```

What the parts mean:

| Part | Meaning |
|---|---|
| `run --rm` | start a one-off k6 container and remove it after the test |
| `--use-aliases` | give the container the network name `k6`, so the live dashboard opens on http://localhost:5665 |
| `k6` | the service defined in `compose.yaml` |
| `01-smoke.js` | the script in `tests/`; extra k6 flags can follow, e.g. `--vus 5` |

Pass parameters with `-e NAME=value` **before** the service name:

```shell
docker compose run --rm --use-aliases -e DURATION_SCALE=0.1 -e TEST_ID=my-run k6 02-average-load.js
```

To run other k6 commands, override the entrypoint:

```shell
docker compose run --rm --entrypoint k6 k6 inspect 07-scenarios.js
docker compose run --rm --entrypoint k6 k6 version
```

## Resource limits

These limits emulate the "hardware" of each server. Change them in `.env` (copy `.env.example`), then run `docker compose up -d` again.

| Service | CPUs | Memory | Variables |
|---|---|---|---|
| quickpizza | 0.5 | 192M | `QUICKPIZZA_CPUS`, `QUICKPIZZA_MEM` |
| quickpizza-db | 0.5 | 256M | `DB_CPUS`, `DB_MEM` |
| victoriametrics | 0.5 | 256M | `VICTORIAMETRICS_CPUS`, `VICTORIAMETRICS_MEM` |
| grafana | 0.25 | 256M | `GRAFANA_CPUS`, `GRAFANA_MEM` |
| telegraf | 0.1 | 96M | `TELEGRAF_CPUS`, `TELEGRAF_MEM` |
| proxy | 0.1 | 32M | `PROXY_CPUS`, `PROXY_MEM` |
| k6 | unlimited | unlimited | the load generator must never be the bottleneck |

Limits are caps, not reservations: an idle container uses far less.

## Network isolation

All containers, k6 included, run on the internal Docker network `workshop`, which has **no internet access**. A typo in `BASE_URL` cannot turn a workshop test into a load test of somebody's real website: k6 can reach only QuickPizza and the monitoring stack.

The only exception is `proxy`, an nginx that publishes the web UIs to `127.0.0.1` on your machine ([`infra/proxy/nginx.conf`](../infra/proxy/nginx.conf)). It forwards fixed ports to fixed containers and is not in the load path: k6 talks to QuickPizza directly.

## Stop and clean up

```shell
docker compose down       # stop; metrics, dashboards and DB data are kept in volumes
docker compose down -v    # stop and delete all data
```

## Troubleshooting

**`port is already allocated`**
Another program uses 3000, 3333, 5665 or 8428. Copy `.env.example` to `.env` and change `GRAFANA_PORT`, `QUICKPIZZA_PORT`, `K6_DASHBOARD_PORT` or `VICTORIAMETRICS_PORT`. All ports bind to `127.0.0.1` only.

**`Conflict. The container name "/quickpizza" is already in use`**
You have QuickPizza running from another project (e.g. Grafana's own compose files). Stop it: `docker rm -f quickpizza quickpizza-db`.

**The *Docker Containers* dashboard is empty**
telegraf reads `/var/run/docker.sock`. That works with Docker Desktop and rootful Docker Engine. With rootless Docker or Podman, the socket lives elsewhere: edit the telegraf volume in `compose.yaml`, e.g. `$XDG_RUNTIME_DIR/docker.sock:/var/run/docker.sock:ro`. Check the logs with `docker compose logs telegraf`.

**The *k6 Prometheus* dashboard shows no data**
- Pick your run in the **testid** selector and set the time range to cover it.
- Data shows up about 10 seconds after the test starts.
- `docker compose ps victoriametrics` must show `healthy`.

**Linux: cannot delete files in `results/`**
k6 runs as root inside the container, so the reports belong to root. Fix it with `sudo chown -R $USER results/`.

**The test itself reports errors like `dial tcp: lookup quickpizza`**
The stack is not running. Run `docker compose up -d` first.

**Windows: `the input device is not a TTY`**
Use Windows Terminal or PowerShell instead of Git Bash/mintty, or add `-T` after `run`.

**The k6 live dashboard on port 5665 shows `502 Bad Gateway`**
No test is running, or k6 was started without `--use-aliases`.
