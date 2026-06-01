# MCP-Proxy-Service

[English](./README.en.md) | 한국어

**REST API → MCP 변환 플랫폼.** REST API 문서(OpenAPI URL/파일 또는 비정형 HTML/PDF/Markdown)를 입력하면
분석 → 정규화 → **무변경(proxy-by-spec) MCP 서버** 생성·배포 → 클라이언트 등록 가이드 출력까지 자동화한다.

> **핵심 불변식**: 런타임 코드는 고정. 행동은 **OpenAPI 스펙 + manifest**(노출 operation·인증·필드 정책)로만 결정된다.
> API별 커스텀 코드 0줄. 설계 문서: [`.doc/PRD-Adv-2nd.md`](./.doc/PRD-Adv-2nd.md).

## 특징

- **선언형 프록시**: 공통 런타임 + API별 manifest 교체만으로 신규 API 온보딩
- **OpenAPI → MCP tool 자동 매핑**: `$ref` 해석, 파라미터/requestBody 병합, 단일 입력 스키마 합성
- **위험 endpoint 자동 제외**: `/admin`·`/internal`·민감 tag·`DELETE` 차단(사유 기록)
- **에이전트 친화 응답 축소**: 필드 필터(`fields`/allow-list), 페이지네이션 강제, 긴 문자열 truncation, 중첩 depth 제한
- **인증**: securitySchemes 파싱(apiKey/Bearer/Basic/OAuth2/OIDC), header/query/cookie 주입, 비밀은 외부 secret 참조(`${ENV}`·`secretRef`)
- **구조화 오류**: `INVALID_API_KEY`·`MISSING_SCOPE`·`AUTH_EXPIRED`·`UPSTREAM_AUTH_UNAVAILABLE`·`TIMEOUT`
- **운송 2종**: stdio(로컬 호스트) + Streamable HTTP/SSE(원격·멀티에이전트) + `/health`
- **비정형 문서 추출**: LLM 초안 + 정적 검증 + confidence/unresolved (Python)

## 구조

| 경로 | 역할 |
|------|------|
| `apps/api` | 무변경 Proxy MCP 런타임 (stdio + Streamable HTTP/SSE) |
| `apps/web` | 변환 플랫폼 UI (Next.js) |
| `packages/manifest` | manifest 스키마·검증·정책 (zod) |
| `packages/converter` | OpenAPI 정규화·매핑·메타데이터·인증 파싱 |
| `packages/extractor` | 비정형 문서 추출 오케스트레이션 (TS) |
| `python/extractor` | LLM 스펙 추출 배치·정적 검증 (FastAPI/uv) |
| `test/` | 시험 시나리오·테스트·결과 ([SCENARIOS](./test/SCENARIOS.md) · [RESULTS](./test/RESULTS.md)) |

스택: node-next-nest (pnpm 모노레포) + Python(uv). 상세 표준: [`AGENTS.md`](./AGENTS.md).

## 시작

```bash
make install   # pnpm install + uv sync
make dev       # apps/api dist 선빌드 → 전체 dev (parallel). 자동 프록시가 항상 최신 코드 사용
make seed      # apps/web/seed/*.json(계정·문서·사용내역)을 DB에 멱등 적용 (수동 시드)
make up        # docker compose (postgres + redis + 서비스)
make clean     # 전체 초기화: dev 프로세스·자동 프록시 종료 + .next·var(app.db/proxies)·dist·캐시 삭제
```

> **MCP 사용내역이 안 잡히거나 상태가 꼬이면** `make clean && make dev`로 완전 초기화. 수동 `rm var/app.db`는 docId·프록시 포트가 매번 바뀌어 MCP 클라이언트 설정(mcp.json)이 어긋나니 지양 — 포트는 승인 시 1회 할당되어 DB에 영속된다.

### 프록시 런타임 실행

```bash
# stdio (Claude Desktop / Cursor)
TRANSPORT=stdio SPEC_PATH=spec.json MANIFEST_PATH=manifest.json node apps/api/dist/main.js

# HTTP/SSE (원격·멀티에이전트)
TRANSPORT=http PORT=8080 SPEC_PATH=spec.json MANIFEST_PATH=manifest.json node apps/api/dist/main.js
curl localhost:8080/health
```

### manifest 예시

```json
{
  "name": "petstore",
  "baseUrl": "https://api.example.com/v1",
  "runtimeAuthPolicy": { "secretRef": "PETSTORE_API_KEY" },
  "fieldsPolicy": { "defaultLimit": 20, "truncateBytes": 2048, "maxDepth": 4 },
  "exclude": ["/internal"]
}
```

비밀은 manifest에 평문 저장 금지 — `secretRef`(env 키) 또는 `${ENV}` 참조만. 평문 의심 시 런타임이 거부한다.

## 웹 인증·워크플로 (apps/web)

회원가입·로그인·TOTP(2FA)·**조직 기반 RBAC·승인 워크플로**. 역할: **SUPERVISOR**(기본관리자) > **ADMIN** > **USER**.
SUPERVISOR는 `.env`로 첫 부팅 시 1회 자동 생성. 기반: bcrypt · otplib(QR) · jose(JWT) · `node:sqlite`(빌트인).

**가입·승인 체인**
- ADMIN 가입 → **조직(Organization) 생성**(중복확인) → `pending` → **SUPERVISOR 승인** → `active`
- USER 가입 → **조직 검색**(텍스트 입력) 선택 → `pending` → 해당 조직 **ADMIN 승인** → `active`
- 양쪽 `active`여야 정상 이용. SUPERVISOR는 역할/상태 직접 변경 가능.

**API 문서(OpenAPI) 등록·승인** (PRD §4.1 A1) — **2가지 모드**
- ① **스키마 링크**: OpenAPI URL 등록 (예: `…/openapi.json`, `…/v3/api-docs`)
- ② **개별 등록**: 개별 REST API(메서드+경로)를 하나씩 추가(Swagger식) → OpenAPI 스펙 자동 합성. 경로의 `{param}`은 path 파라미터로 자동 변환.
- 공통: USER가 **등록·수정·삭제**(변경 시 `pending`) → ADMIN/SUPERVISOR가 **요청 확인**(URL fetch/합성 + 변환 미리보기) → 정상 **승인** / 비정상 **반려**(사유). ADMIN=같은 조직, SUPERVISOR=전체.
- **승인 시 프록시 자동 기동**: 문서 승인 → **20000+ 빈 포트 자동 할당**(중복·OS 사용 중 제외, DB 영속화) → spec.json·manifest.json 기록 후 `apps/api/dist/main.js`를 `TRANSPORT=http`로 **자동 spawn**. 반려/수정/삭제 시 자동 중지, 웹 부팅 시 승인 문서 **재기동(reconcile, 저장 포트 재사용)**. 상태는 `GET /api/apidocs/:id/proxy`. → "Server disconnected" 수동 실행 불필요.
- **승인 후 MCP 등록 가이드**: 문서 목록 “가이드” → 등록된 baseUrl·포트 기반 **동적 생성** + **실시간 프록시 상태**(실행 중 ✓). manifest.json · mcp.json(stdio) · HTTP 실행/설정 복사 + 스펙 다운로드. 클라이언트는 프록시 포트로 접속. Claude Desktop은 `{url}` 미지원 → **`mcp-remote` 브리지**(stdio command) 형태, Cursor 등 HTTP 직접 지원 클라이언트는 `{url}` 형태 둘 다 제공.

**엔드포인트**: `/api/auth/{register,login,me,totp/qr,totp/enable}` · `/api/orgs/{check,search}` ·
`/api/users`(목록)·`/api/users/:id/{approve,reject}`·`PATCH /api/users/:id`(SUPERVISOR 역할·상태 / ADMIN 조직 USER 상태) ·
`/api/apidocs`(CRUD)·`/api/apidocs/:id/{preview,approve,reject,openapi.json}`·`/api/apidocs/:id/endpoints`(개별 등록)

**역할별 대시보드 (그래픽)** — **Shadcn UI Chart(recharts) + Tailwind CSS**. 텍스트 최소·도식 위주, 단일 화면.
- **도넛 8종**(범례 없이 마우스오버 툴팁): 상단 4 — MCP 현황(성공/실패)·API 요청/승인 현황(승인/대기/반려)·조직 사용자(active/pending)·로그인(역할별 USER/ADMIN); 하단 4 — API(tool)별·사용자(caller)별·문서 상태·지역별 호출
- **시간대 히트맵**: API(tool)별 카드 우상단 **“시간대별”** 클릭 시 **팝업**(가로=호출 top7, 세로=시간 0–23, 색=빈도)
- **세계지도**: **static 로컬 PNG**(`apps/web/public/world-map.png`, 회색 라벨 세계지도) 위 요청 위치 마커(크기·색=빈도) — 좌표는 지도 픽셀 기준 직접 측정, 마우스오버 지역·수치 툴팁, **클릭 시 전체화면 확대**
- **API 요청 내역**: 등록 문서가 **있을 때만** 표시 (승인여부·반려, 미승인 알림, 승인 API의 **MCP 호출 히스토리** 펼침)
- **화면 모드**: 좌측 하단 계정 옆 **아이콘 순환 토글**(시스템🖥→라이트☀️→다크🌙). 상단 고정 영역 없음
- **알림**: 받은 알림이 **있을 때만** 대시보드 우측 하단 **팝업**(ADMIN/SUPERVISOR, 15초 폴링, 확인·닫기) — 참고: Eden-FP notifications-card
- **테마 통일**: Tailwind + Shadcn HSL 토큰(CSS 변수)으로 네비·콘텐츠·차트·로그인 일괄 적용, `data-theme`로 라이트/다크 전환
- 알림 흐름: USER→조직 ADMIN, ADMIN→SUPERVISOR (pending 시 발송). MCP 호출은 프록시가 `USAGE_REPORT_URL`+`USAGE_TOKEN`(+`USAGE_REGION`/`USAGE_CALLER`) 설정 시 기록. 집계 `/api/stats/usage`.

**설정·계정**: 설정 화면에서 **비밀번호 변경**(현재 검증) + TOTP 등록. SUPERVISOR/ADMIN은 사용자관리에서 **비밀번호 초기화**(ADMIN=같은 조직 USER, SUPERVISOR=전체). 좌측 네비 **접힘 토글**(localStorage 유지).

**멤버 초대** (SUPERVISOR/ADMIN, 사용자관리 → "멤버 초대"): ① **이메일** 초대 → SMTP 발송(`.env`), 미설정 시 링크 반환. ② **초대 링크**(30분) — 조직 + 허용 이메일 도메인 지정. `/invite/[token]` 수락 → `active` 계정 생성. ADMIN=자기 조직 USER, SUPERVISOR=임의 조직 USER/ADMIN. 메일은 Claude 스타일 HTML 템플릿.

**화면**: `/login` `/register`(역할·조직) `/invite/[token]`(초대 수락) · `/(app)/{dashboard,apidocs,approvals,users,settings}`

**dev 테스트 계정·데모 데이터** — 데이터는 코드가 아닌 [`apps/web/seed/`](./apps/web/seed) JSON(`accounts`·`apidocs`·`usage`). `SEED_TEST_ACCOUNTS=true`면 첫 부팅 자동 시드, 또는 `make seed`로 수동(멱등). 규칙: 약어+1234.
`supervisor@example.com/supervisor1234`(SUPERVISOR, `.env`) · `ad@x.com/ad1234`(ADMIN, demo-org) · `us@x.com/us1234`(USER, demo-org). 모두 active. 데모 문서 `demo-bookcollection`(승인됨) + 차트용 사용내역 60건 포함. 계정·문서·분포를 바꾸려면 JSON 편집 후 `make seed`.

**변환 테스트용 샘플 API**: [`api-samples/`](./api-samples) — FastAPI(`:8000/openapi.json`)·Spring Boot(`:8080/v3/api-docs`) CRUD. “스키마 링크” 모드 입력으로 변환 확인.

## 환경 변수

루트 `.env.{local,dev,staging,prod}` (프록시·인프라) + `apps/web/.env.local`(웹). 템플릿: `.env.example`, `apps/web/.env.example`.

| 키 | 용도 | local/dev | staging | prod |
|----|------|-----------|---------|------|
| `TRANSPORT`·`PORT` | MCP 운송·포트 | stdio·http / 8080 | http | http |
| `DATABASE_URL` | 프록시 메타 DB | sqlite | postgresql | (주입) |
| `SUPERVISOR_EMAIL`·`SUPERVISOR_PASSWORD` | **기본관리자 초기 설정** (둘 다 설정 시 첫 부팅 1회 생성) | demo 값 | `__INJECT__` | (주입) |
| `JWT_SECRET`·`JWT_EXPIRES_IN` | JWT 서명·만료 | dev 값 | `__INJECT__` | (주입) |
| `BCRYPT_ROUNDS` | 해시 라운드 | 10 | 12 | (주입) |
| `TOTP_ISSUER` | 인증 앱 표시명 | MCP-Proxy | MCP-Proxy | (주입) |
| `SQLITE_PATH` | 사용자 DB 경로 | `./var/app.db` | `./var/app.db` | (주입) |
| `SEED_TEST_ACCOUNTS` | dev 테스트 계정 시드 | true | false | false |
| `USAGE_TOKEN` | MCP 호출 사용내역 보고 공유 토큰 | dev 값 | `__INJECT__` | (주입) |
| `APP_BASE_URL` | 초대 링크 베이스 URL | localhost:3000 | `__INJECT__` | (주입) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | 초대 메일 SMTP (미설정 시 링크 폴백) | 미설정 | `__INJECT__` | (주입) |

> 규칙: `.env.local`·`.env.dev`만 실제 dev 값. `.env.staging`는 비밀에 `__INJECT__`, `.env.prod`는 **키 목록만**(Secret Manager 주입). `.env.*`는 gitignore, `.env.example`만 커밋.

## 테스트

```bash
pnpm test                              # vitest (96: 변환/프록시/인증/워크플로/대시보드/초대)
python3 test/python/test_extractor.py  # python (5)
tsc -b apps/api                        # 빌드 검증
```

현재 상태 — vitest 96 + python 5 + 라이브 스모크 PASS:
- 변환·프록시 [RESULTS.md](./test/RESULTS.md)
- 인증 [RESULTS-auth.md](./test/RESULTS-auth.md)
- 조직·승인 워크플로 [RESULTS-workflow.md](./test/RESULTS-workflow.md)

## 라이선스

채택 오픈소스(`mcp-openapi-server` 등) 라이선스는 포크/임베드 전 검토. PRD §10 참조.
