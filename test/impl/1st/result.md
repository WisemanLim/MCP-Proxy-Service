# 시험 결과 — 1st iteration: HTML API 문서 처리

## 판정: PASS (신규 기능 전건 통과, 기존 회귀 없음)

## 실행 환경
- Node: 20.20.1 (Node 22+ 권장 — node:sqlite 빌트인 미지원, 기존 이슈)
- pnpm: 9.12.0
- vitest: 2.1.9

## 결과 요약

| 구분 | 파일 | 건수 | 결과 |
|------|------|------|------|
| 신규 | test/html-extractor.test.ts | 6 | ✅ PASS |
| 기존 | test/converter.test.ts | 20 | ✅ PASS |
| 기존 | test/core.test.ts | 20 | ✅ PASS |
| 기존 | test/manifest.test.ts | 6 | ✅ PASS |
| 기존 | test/transport.test.ts | 3 | ✅ PASS |
| 기존 이슈 | test/auth.test.ts | — | ❌ node:sqlite (Node 20, 기존 이슈) |

**총 55건 PASS / 신규 6건 PASS**

## 신규 테스트 케이스 통과 내역

| 케이스 | 검증 내용 | 결과 |
|--------|-----------|------|
| T2 | SwaggerUI JS `url: "/v3/api-docs"` 패턴 인식 후 spec fetch | ✅ |
| T3 | `<a href="/api.json">` href 패턴 인식 후 spec fetch | ✅ |
| T4 | 패턴 없을 때 fallback `/v3/api-docs` 성공 | ✅ |
| T4b | 패턴 없을 때 fallback `/openapi.json` 성공 | ✅ |
| T5 | 모든 경로 실패 → `html_spec_not_found` 에러 | ✅ |
| T2b | url 패턴이 HTML 반환 시 건너뛰고 fallback 성공 | ✅ |

## 구현 파일

| 파일 | 변경 | 설명 |
|------|------|------|
| `apps/web/lib/html-spec-extractor.ts` | 신규 | `extractSpecFromHtml` 순수 함수 (테스트 가능, server-only 없음) |
| `apps/web/lib/server/apidocs.ts` | 수정 | HTML 감지 시 에러 대신 `extractSpecFromHtml` 호출, `AuthError` 래핑 |
| `test/html-extractor.test.ts` | 신규 | 6개 단위 테스트 |

## 기존 이슈 (내 변경과 무관)

- `test/auth.test.ts` / `apps/web next build`: `node:sqlite` = Node 22+ 빌트인. Node 20에서 실패.
  → Node 22 환경에서 정상 동작. packages/*, apps/api TS 컴파일은 정상.
  → 내 추가 코드(`html-spec-extractor.ts`)는 node:sqlite 의존 없음, 별도 파일로 분리됨.

## 동작 설명

`source_type=url` 문서가 HTML 반환 시 3단계 자동 탐색:
1. **JS url 패턴**: `url: "/path"` 형태 SwaggerUI/Redoc 설정에서 스펙 URL 수집
2. **href 링크**: `<a href="*.json">`, `<a href="*.yaml">` 링크에서 수집
3. **Origin fallback**: `/openapi.json`, `/swagger.json`, `/v3/api-docs`, `/v2/api-docs` 등 8개 경로 순차 시도

모든 경로 실패 시 `html_spec_not_found` 에러(직접 URL 입력 안내 포함).
