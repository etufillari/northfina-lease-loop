SHELL := /bin/sh
.DEFAULT_GOAL := help

# Extra CLI options, for example: make build ARGS=--webpack
ARGS ?=

.PHONY: help setup install dev run build start check test test-watch coverage \
	lint format typecheck db-setup db-seed migrate studio clean

help: ## List available commands (also the default for make)
	@printf '\nLease Loop\n\n'
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z_-]+:.*## / { printf "  %-14s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\nFirst run: make setup && make dev\nExtra CLI options: make build ARGS=--webpack\n\n'

# Run database setup only after installation, including when make uses -j.
setup: install ## Install dependencies, create local settings, migrate and seed
	$(MAKE) db-setup

install: ## Install the locked dependencies, generate Prisma and install Git hooks
	npm ci

dev: ## Start development at http://localhost:3000 (Ctrl+C to stop)
	npm run dev -- $(ARGS)

run: dev ## Alias for dev

build: ## Build the production app; accepts ARGS=--webpack
	npm run build -- $(ARGS)

start: ## Serve an existing production build at http://localhost:3000
	npm run start -- $(ARGS)

check: ## Run the complete local check suite, including coverage and build
	npm run check:all

test: ## Run all tests once; accepts ARGS="src/domain/pricing.test.ts"
	npm test -- $(ARGS)

test-watch: ## Rerun tests as files change
	npm run test:watch -- $(ARGS)

coverage: ## Run tests with the coverage gate and HTML report
	npm run test:coverage -- $(ARGS)

lint: ## Check ESLint rules
	npm run lint

format: ## Format project files with Prettier
	npm run format

typecheck: ## Generate route types and check TypeScript
	npm run typecheck

db-setup: ## Apply migrations and add missing seed assets without resetting data
	RUST_LOG=info npm run db:setup

db-seed: ## Add missing seed assets to an initialized database
	npm run db:seed

migrate: ## Generate a migration; accepts ARGS="--name describe_change"
	npm run db:migrate -- $(ARGS)

studio: ## Open Prisma Studio to browse the configured database
	npm run db:studio

clean: ## Remove build, coverage and TypeScript caches; keep local settings and data
	rm -rf .next coverage
	rm -f tsconfig.tsbuildinfo
