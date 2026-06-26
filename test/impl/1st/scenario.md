# 시험 시나리오 — 1st iteration: HTML API 문서 처리

## 목적
`source_type=url` 문서가 HTML 응답을 반환할 때 OpenAPI 스펙을 자동 추출하는 기능 검증.
구현 위치: `apps/web/lib/html-spec-extractor.ts` → `apps/web/lib/server/apidocs.ts`.

## 변경 요약
- 신규 `apps/web/lib/html-spec-extractor.ts`: `extractSpecFromHtml` 순수 함수 (3단계 탐색)
- `loadSpec` URL 분기: 본문 첫 문자 `<` 감지 시 에러 대신 `extractSpecFromHtml` 호출
- 3단계 탐색: ① JS `url: "..."` 패턴 → ② `<a href>` JSON/YAML → ③ origin 공통 경로 8개

## 시험 케이스

| # | 케이스 | 기대 결과 |
|---|--------|-----------|
| T2 | HTML 내 SwaggerUI `url: "/v3/api-docs"` 패턴 | spec URL 발견 후 로드 PASS |
| T3 | `<a href="/api.json">` 링크 | spec URL 발견 후 로드 PASS |
| T4 | 패턴 없음 → fallback `/v3/api-docs` | PASS |
| T4b | 패턴 없음 → fallback `/openapi.json` | PASS |
| T5 | 모든 경로 404 | `html_spec_not_found` 에러 |
| T2b | url 패턴이 HTML 반환 → 건너뛰고 fallback | PASS |

## 실행
```
cd /Users/wise/Developer/wise-project/MCP-Proxy-Service
pnpm test
```

## 합격 기준
- `pnpm test` 전체 exit 0 (기존 건수 유지 + T2~T5 신규 6건 PASS)
- TypeScript 빌드 오류 없음
