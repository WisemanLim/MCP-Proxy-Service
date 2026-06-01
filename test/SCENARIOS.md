# 시험 시나리오 (PRD-Adv-2nd 기능 검증)

대상: `.doc/PRD-Adv-2nd.md` §4 기능 요구사항. 픽스처: `test/fixtures/petstore.ts`.
실행: `pnpm test` (vitest) + `python3 test/python/test_extractor.py`.

## 매핑 표 (PRD 요구 → 시나리오 → 파일)

| ID | PRD | 시나리오 | 기대 결과 | 파일 |
|----|-----|----------|-----------|------|
| TC-A1-1 | A1 | inline 객체 로드 | OpenAPISpec 반환 | converter.test.ts |
| TC-A1-2 | A1 | JSON 문자열 로드 | 파싱 성공 | converter.test.ts |
| TC-A1-3 | A1 | YAML 문자열 로드 | 파싱 성공 | converter.test.ts |
| TC-A1-4 | A1 | v2/비OpenAPI 입력 | 에러 throw | converter.test.ts |
| TC-A3-1 | A3 | `$ref` 파라미터 해석 | limit 파라미터 병합됨 | converter.test.ts |
| TC-A3-2 | A3 | requestBody `$ref` 해석 | NewPet 스키마 인라인 | converter.test.ts |
| TC-A3-3 | A3 | path+operation 파라미터 병합 | 중복 없이 합쳐짐 | converter.test.ts |
| TC-A4-1 | A4 | 메타데이터 추출 | baseUrl·authSchemes·endpointCount | converter.test.ts |
| TC-A4-2 | A4 | 위험 endpoint 탐지 | /admin·DELETE 식별 | converter.test.ts |
| TC-A4-3 | A4 | 품질 점수 0-100 | 범위 내 정수 | converter.test.ts |
| TC-B1-1 | B1 | operationId → tool 이름 | listPets 등 | converter.test.ts |
| TC-B1-2 | B1 | operationId 없으면 slug | method_path | converter.test.ts |
| TC-B3-1 | B3 | /admin 자동 제외 | excluded에 adminStats | converter.test.ts |
| TC-B3-2 | B3 | DELETE 자동 제외 | excluded에 deletePet | converter.test.ts |
| TC-B3-3 | B3 | manifest exclude 적용 | 지정 경로 제외 | converter.test.ts |
| TC-B4-1 | B4 | 단일 입력 스키마 합성 | path/query/body 통합 object | converter.test.ts |
| TC-B4-2 | B4 | required 반영 | 필수 파라미터 required[] | converter.test.ts |
| TC-D1-1 | D1 | securitySchemes 파싱 | apiKey·bearer 식별 | converter.test.ts |
| TC-D1-2 | D1 | auth matrix | operation별 scheme 매핑 | converter.test.ts |
| TC-C2-1 | C2 | manifest 검증 통과 | parseManifest 성공 | manifest.test.ts |
| TC-C2-2 | C2 | baseUrl 누락 거부 | zod 에러 | manifest.test.ts |
| TC-D3-1 | D3 | spec_auth/runtime 분리 | 두 섹션 독립 | manifest.test.ts |
| TC-D4-1 | D4 | 평문 비밀 거부 | assertNoPlaintextSecret throw | manifest.test.ts |
| TC-D4-2 | D4 | `${ENV}` 참조 허용 | 통과 | manifest.test.ts |
| TC-D4-3 | D4 | secretRef → env 해석 | env 값 반환 | manifest.test.ts |
| TC-D2-1 | D2 | apiKey header 주입 | X-API-Key 헤더 | core.test.ts |
| TC-D2-2 | D2 | bearer 주입 | Authorization: Bearer | core.test.ts |
| TC-D2-3 | D2 | query/cookie 주입 | 위치별 삽입 | core.test.ts |
| TC-C1-1 | C1 | path 파라미터 치환 | /pets/{id}→/pets/7 | core.test.ts |
| TC-C1-2 | C1 | query 직렬화 | ?tag=x | core.test.ts |
| TC-C1-3 | C1 | body 직렬화 + CT | JSON body | core.test.ts |
| TC-C1-4 | C1 | timeout → TIMEOUT | ProxyError TIMEOUT | core.test.ts |
| TC-C1-5 | C1 | 5xx 재시도 | retry 후 성공 | core.test.ts |
| TC-C5-1 | C5 | fields projection | 지정 필드만 | core.test.ts |
| TC-C5-2 | C5 | allow-list 우선 | allow 외 제거 | core.test.ts |
| TC-C6-1 | C6 | 페이지네이션 기본 limit | defaultLimit 적용 | core.test.ts |
| TC-C6-2 | C6 | nextCursor 산출 | offset+limit | core.test.ts |
| TC-C6-3 | C6 | string truncation | truncateBytes 초과 자름 | core.test.ts |
| TC-C6-4 | C6 | depth 제한 | maxDepth 초과 치환 | core.test.ts |
| TC-D5-1 | D5 | 401 → INVALID_API_KEY | 구조화 코드 | core.test.ts |
| TC-D5-2 | D5 | 403 → MISSING_SCOPE | 구조화 코드 | core.test.ts |
| TC-D5-3 | D5 | 503 → UPSTREAM_AUTH_UNAVAILABLE | 구조화 코드 | core.test.ts |
| TC-RT-1 | C1 | callTool end-to-end | fake upstream 응답 정규화 | core.test.ts |
| TC-RT-2 | D4 | 평문 비밀 manifest 거부 | 생성자 throw | core.test.ts |
| TC-C3-1 | C3/C4 | MCP tools/list | 제외 후 tool 목록 | transport.test.ts |
| TC-C4-1 | C4 | MCP call_tool | data+meta 반환 | transport.test.ts |
| TC-C4-2 | D5 | call_tool 에러 | isError + 코드 | transport.test.ts |
| TC-F4-1 | F4 | 유효 스펙 검증 | valid=true | python/test_extractor.py |
| TC-F4-2 | F4 | responses 누락 탐지 | errors 포함 | python/test_extractor.py |
| TC-F4-3 | F4 | 깨진 $ref 탐지 | errors 포함 | python/test_extractor.py |
| TC-F2-1 | F2 | IR 생성 | endpoint별 confidence | python/test_extractor.py |
| TC-F6-1 | F6 | unresolved 산출 | 저신뢰+에러 목록 | python/test_extractor.py |

## 절차

1. 시나리오대로 시험 코드 작성.
2. `pnpm test` + python 테스트 실행.
3. 실패 시 원인 분석 → 소스 수정 → 재시험 (RESULTS.md에 이력).
4. 전체 green 후 `test/RESULTS.md` 작성.
