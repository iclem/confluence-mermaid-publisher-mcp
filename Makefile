SHELL := /bin/bash
COMPOSE_FILE ?= -f build/docker-compose/docker-compose-local.yml

.PHONY: build shell test test-parser check-parser test-generator test-e2e image-mcp mcp-http

DEV_RUN = docker compose $(COMPOSE_FILE) run --rm dev bash -lc


help: # Show help for each of the Makefile recipes.
	@grep -E '^[a-zA-Z0-9 -_]+:.*#'  Makefile | while read -r l; do printf "$(S)$(G)$$(echo $$l | cut -f 1 -d':')$(E):\t\t$$(echo $$l | cut -f 2- -d'#')\n"; done

build: # Build dev image
	docker compose $(COMPOSE_FILE) build

shell: # Open a shell on dev container
	docker compose $(COMPOSE_FILE) run --rm dev

test: # Run all tests
	$(DEV_RUN) 'cd /app && ./scripts/test.sh'

test-parser:
	$(DEV_RUN) 'cd /app && npm --prefix parser test'

check-parser:
	$(DEV_RUN) 'cd /app && npm --prefix parser run check'

test-generator:
	$(DEV_RUN) 'cd /app && mvn -q -f generator/pom.xml test'

test-e2e: # Run e2e tests on mermaid diagram samples
	$(DEV_RUN) 'cd /app && ./scripts/test-e2e.sh'

image-mcp: # Build MCP server image
	docker build -t confluence-mermaid-publisher-mcp:local .

mcp-http: # Run the local HTTP MCP server through docker compose
	docker compose $(COMPOSE_FILE) up -d mcp-http --force-recreate


# End Strong Red Green Blue Teal White Yellow bacKground
E=$(shell tput sgr0)
S=$(shell tput bold)
R=$(shell tput setaf 1)
G=$(shell tput setaf 2)
B=$(shell tput setaf 4)
T=$(shell tput setaf 6)
W=$(shell tput setaf 15)
Y=$(shell tput setaf 11)
K=$(shell tput smso)
