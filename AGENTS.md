# 개발환경 표준 (Wise Dev Standard)

> 이 파일은 Claude Code / Cursor / Antigravity 가 공통으로 읽는 프로젝트 표준이다.
> AI 코딩 도구는 코드·CI·인프라 생성 시 아래 표준을 기본값으로 준수한다.

## 현재 프로젝트 기본 스택 (node-next-nest)

REST API → MCP 변환 플랫폼 (선언형 proxy-by-spec). 설계: `.doc/PRD-Adv-2nd.md`.

- **언어**: Node/TypeScript (코어, `@modelcontextprotocol/sdk`) + Python 보조(LLM 스펙 추출)
- **패키지매니저**: pnpm 워크스페이스 (모노레포) · Python은 uv
- **프론트**: Next.js(App Router) + React + TS + Tailwind — `apps/web`
- **백엔드**: NestJS proxy 런타임 — `apps/api` (stdio + Streamable HTTP/SSE) · FastAPI 추출 — `python/extractor`
- **DB**: local=SQLite, dev+=PostgreSQL + Redis
- **실행**: `make dev` / `docker compose up` · prod=K8s + Helm + Argo CD/Flux
- **핵심 불변식**: 런타임 코드 고정, 행동은 `packages/manifest` 의 manifest(spec/auth/fields policy)로만 결정.

패키지: `apps/api` · `apps/web` · `packages/{shared,converter,extractor,manifest}` · `python/extractor`.

## 우선순위 언어
Node/TypeScript · Python · Rust · Go · C/C++ (동점이면 이 순서).
- Node/TS: 프론트, BFF/API Gateway, 프론트 근접 서비스
- Python: 데이터/ML/분석/ETL API, RAG (uv + uvicorn + FastAPI)
- Go: 고처리량·저지연 코어, 워커 (단일 바이너리)
- Rust: 메모리안전+극한성능, 재색인 워커, Tauri 데스크톱
- C/C++: 네이티브 모듈, 시스템 수준 (CMake + Ninja)

## 패키지 매니저
- Python: **uv** (대안 pip) — pyproject.toml + uv.lock
- Node: **pnpm** (대안 npm) — monorepo 는 pnpm workspaces
- Go: go modules · Rust: cargo
- 금지/지양: forever(레거시), yarn/bun 은 승인제

## 레이어 표준
- Frontend: Next.js(App Router) + React + TypeScript + Tailwind, Vitest + Playwright, Storybook
- Backend: NestJS(Node) / FastAPI(Python) / Gin(Go) / Axum(Rust)
  - ORM: Prisma / SQLAlchemy / GORM / SQLx
- Database: PostgreSQL(신규 기본) + Redis, local/test 만 SQLite
  - 벡터=PGVector/Chroma, 그래프=Neo4j (필요 시)
- Ops: GitHub Actions(or GitLab CI), Docker + Compose, Kubernetes + Helm, Argo CD/Flux, SonarQube + Sentry
- App: Flutter/React Native + Fastlane + Firebase, 데스크톱=Tauri(Rust)

## 환경 (local / dev / staging / prod)
| 환경 | DB | compose | 핵심 |
|---|---|---|---|
| local | SQLite | 보통 X | 빠른 반복, 외부 의존 최소 |
| dev | PostgreSQL | O | 공유 개발 DB + Redis |
| staging | PostgreSQL | O | prod 동등 구성 검증 |
| prod | PostgreSQL | (K8s) | Helm + GitOps |

## 실행 방식
- 직접: `pnpm dev` / `uv run uvicorn app.main:app --reload` / `go run ./cmd/server` / `cargo run`
- 컨테이너: `docker compose up`
- 프로덕션: K8s + Helm. Node 프로세스 관리는 PM2(베어메탈) 또는 K8s.
- 공통 진입점은 Makefile: `make dev | test | build | deploy`.

## CI/CD
단일 파이프라인으로 build → test → scan → deploy. K8s 배포는 GitOps(Argo CD/Flux).

## 코드 생성 정책 (AI 도구용)
1. 외부 트래픽/SEO 웹 → Next.js. 내부 툴/콘솔 → Vite 기반 SPA.
2. BFF/API Gateway → NestJS. 데이터/ML API → FastAPI. 고성능 코어 → Go/Rust.
3. 신규 DB → PostgreSQL + Redis. 로컬/테스트만 SQLite.
4. CI 는 GitHub Actions(or GitLab CI), 쿠버네티스 배포는 Helm + GitOps.
5. 시크릿은 코드/`.env` 에 하드코딩 금지 — Vault/Secret Manager 주입.

## 도메인(연구/RAG) 확장 시
출처 병기 · 권한(ACL) 필터 · 비식별화 · 감사로그 · 재현성(모델/청커/프롬프트 버전 고정) ·
하이브리드 검색(BM25+벡터) 을 기본 전제로 한다. 고위험 응답은 human-in-the-loop.

---
_생성: wise-dev-standard 플러그인. 갱신은 `/wise-dev-standard:standardize`._
