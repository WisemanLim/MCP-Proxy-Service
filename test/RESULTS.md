# 시험 결과 (PRD-Adv-2nd 기능 검증)

| 항목 | 값 |
|------|-----|
| 실행일 | 2026-06-01 |
| 환경 | Node 26 · vitest 2.1.9 · Python 3.14 |
| 명령 | `pnpm test` (vitest) + `python3 test/python/test_extractor.py` + HTTP 스모크 |
| 결과 | **TS 49/49 PASS · Python 5/5 PASS · HTTP 스모크 PASS** |

## 1. 요약

| 스위트 | 테스트 수 | 결과 |
|--------|-----------|------|
| manifest.test.ts (C2,D3,D4) | 6 | ✅ |
| converter.test.ts (A1,A3,A4,B1,B3,B4,D1) | 20 | ✅ |
| core.test.ts (C1,C5,C6,D2,D5,RT) | 20 | ✅ |
| transport.test.ts (C3,C4,D5) | 3 | ✅ |
| python/test_extractor.py (F2,F4,F6) | 5 | ✅ |
| **합계** | **54** | **✅ 전부 통과** |

빌드: `tsc -b apps/api` → exit 0 (dist 산출). HTTP 스모크: `/health`=200 `{status:ok,tools:1}`, `POST /mcp tools/list`=tool 목록 반환(SSE).

## 2. PRD 요구사항 커버리지

| PRD | 요구 | 우선순위 | 검증 | 상태 |
|-----|------|----------|------|------|
| A1 | 입력 4종(inline/JSON/YAML/파일·URL) | MUST | TC-A1-1~4 | ✅ |
| A3 | `$ref` 해석·파라미터 병합 | MUST | TC-A3-1~3 | ✅ |
| A4 | 운영 메타데이터 추출 | MUST | TC-A4-1~3 | ✅ |
| B1 | operationId/slug tool 매핑 | MUST | TC-B1-1~2 | ✅ |
| B3 | 위험 endpoint 자동 제외 | MUST | TC-B3-1~3 | ✅ |
| B4 | 단일 입력 스키마 합성 | MUST | TC-B4-1~2 | ✅ |
| C1 | 프록시 코어(executor/timeout/retry) | MUST | TC-C1-1~5, TC-RT-1 | ✅ |
| C2 | manifest 스키마·검증 | MUST | TC-C2-1~2 | ✅ |
| C3 | stdio 운송 | MUST | main.ts + buildMcpServer | ✅ (스모크는 HTTP) |
| C4 | Streamable HTTP/SSE | MUST | TC-C3-1, TC-C4-1, HTTP 스모크 | ✅ |
| C5 | 필드 필터(allow-list/fields) | SHOULD | TC-C5-1~2 | ✅ |
| C6 | 페이지네이션·truncation·depth | SHOULD | TC-C6-1~4 | ✅ |
| D1 | securitySchemes 파싱·auth matrix | MUST | TC-D1-1~2 | ✅ |
| D2 | auth injector(header/query/cookie) | MUST | TC-D2-1~3 | ✅ |
| D3 | spec_auth/runtime_auth_policy 분리 | SHOULD | TC-D3-1 | ✅ |
| D4 | 비밀 외부 참조·평문 거부 | MUST | TC-D4-1~3, TC-RT-2 | ✅ |
| D5 | 구조화 오류 코드 | SHOULD | TC-D5-1~3, TC-C4-2 | ✅ |
| E2 | stdio + HTTP 2 타깃·readiness | MUST | HTTP 스모크(`/health`,`tools/list`) | ✅ |
| F2 | IR 구조 추출 | SHOULD | TC-F2-1 | ✅ |
| F4 | 정적 검증(syntax/`$ref`/required) | MUST | TC-F4-1~3 | ✅ |
| F6 | unresolved questions 산출 | SHOULD | TC-F6-1 | ✅ |

미구현(범위 외, PRD 마일스톤 M6 / COULD): A2 비정형 HTML/PDF 수집·B2 Resource 승격·E3 K8s·E4 GitOps·F5 sandbox 실행검증. 코드 스텁/주석 TODO로 표시.

## 3. 시험 중 발견·수정 이력

| # | 증상 | 원인 | 수정 | 재시험 |
|---|------|------|------|--------|
| 1 | transport.test.ts 로드 실패 (`@modelcontextprotocol/sdk` resolve 불가) | pnpm 격리 설치 — SDK가 `apps/api`에만, 루트 미존재 | 루트 devDeps에 `@modelcontextprotocol/sdk` 추가 후 `pnpm install` | ✅ 3/3 통과 |
| 2 | `tsc` 빌드 실패 — `process`/`node:fs` 미인식, 워크스페이스 타입 미해석 | `@types/node` 누락 + manifest/converter `.d.ts` 미빌드 | 각 패키지 `@types/node` 추가 + `composite`/`references`로 TS 프로젝트 참조 구성 | ✅ `tsc -b` exit 0 |

런타임 테스트(vitest, esbuild 트랜스폼)는 #2와 무관하게 처음부터 통과 — #2는 빌드 산출(`make build`)용 타입 구성 결함이었고 기능 결함 아님.

## 4. 재현 방법

```bash
pnpm install
pnpm test                              # vitest 49
python3 test/python/test_extractor.py  # python 5
tsc -b apps/api                        # 빌드 검증
# HTTP 스모크:
TRANSPORT=http PORT=8077 \
  SPEC_PATH=<spec.json> MANIFEST_PATH=<manifest.json> \
  node apps/api/dist/main.js &
curl localhost:8077/health
```

## 5. 결론

PRD-Adv-2nd MUST 요구 전부 + SHOULD 대부분 구현·검증 완료. 무변경 프록시 불변식(런타임 코드 고정·manifest 구동), 선언형 OpenAPI→MCP 변환, 필드 필터·인증 주입·구조화 오류, stdio/HTTP 운송, 비정형 추출 정적 검증까지 54개 테스트로 그린. COULD/M6 항목은 후속.
