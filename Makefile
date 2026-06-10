.PHONY: dev test build deploy up up-all down down-all install clean build-api seed

ENV ?= local

FULL := docker compose -f docker-compose.yml -f docker-compose.full.yml

up:       ; docker compose up -d        # 인프라만(postgres+redis). 앱은 make dev
up-all:   ; $(FULL) up -d --build       # 풀 docker: 인프라 + api/web/extractor 빌드·기동
down:     ; docker compose down
down-all: ; $(FULL) down
install: ; pnpm install && cd python/extractor && uv sync

# apps/api dist 선빌드 → 웹이 자동 기동하는 per-doc 프록시가 항상 최신 코드(reportUsage 등) 사용
build-api: ; pnpm --filter @mcp-proxy/api build

# 시드: apps/web/seed/*.json(계정·문서·사용내역)을 DB에 멱등 적용 (cwd=apps/web → ./var/app.db)
seed: ; pnpm --filter @mcp-proxy/web exec tsx --tsconfig scripts/tsconfig.json scripts/seed.ts

dev: build-api
	pnpm -r --parallel dev

test:    ; pnpm -r test && cd python/extractor && uv run pytest
build:   ; docker build -t mcp-proxy/api -f apps/api/Dockerfile . && docker build -t mcp-proxy/web -f apps/web/Dockerfile .
deploy:  ; helm upgrade --install mcp-proxy ./deploy/helm || echo "helm chart 미구성 (M6)"

# 전체 환경 초기화: dev 프로세스·자동 프록시 종료 + 빌드/캐시/DB/프록시 런타임 삭제
clean:
	-@pkill -f "next dev" 2>/dev/null || true
	-@pkill -f "tsx watch" 2>/dev/null || true
	-@pkill -f "apps/api/dist/main.js" 2>/dev/null || true
	-@lsof -ti tcp:8080 2>/dev/null | xargs kill -9 2>/dev/null || true
	rm -rf apps/web/.next apps/web/var apps/api/dist node_modules/.cache .turbo
	@echo "✓ cleaned — .next · var(app.db/proxies) · dist · caches 삭제, dev 프로세스·프록시 종료"
