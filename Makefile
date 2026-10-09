.PHONY: up down clean ps logs test faults-on faults-off

T ?= 01-smoke

up: | .env
	docker compose up -d

.env:
	cp .env.example .env

down:
	docker compose down

clean:
	docker compose down -v --remove-orphans

ps:
	docker compose ps

logs:
	docker compose logs -f quickpizza

test:
	docker compose run --rm --use-aliases k6 $(T).js

faults-on:
	docker compose -f compose.yaml -f compose.faults.yaml up -d quickpizza

faults-off:
	docker compose up -d quickpizza
