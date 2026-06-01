# 시험 결과 — 역할/조직/승인 워크플로 + API문서 등록·승인

| 항목 | 값 |
|------|-----|
| 실행일 | 2026-06-01 |
| 범위 | PRD §4.1 A1(OpenAPI URL/파일) + Part A(문서 승인) + Part B(가입·조직·승인 체인) |
| 결과 | **단위 22/22 PASS · 라이브 풀체인 10/10 PASS · 전체 vitest 71** |

## 1. 역할·상태 모델

역할 `SUPERVISOR > ADMIN > USER`. 계정상태 `pending → active / rejected / disabled`.
조직(Organization): ADMIN이 가입 시 생성(중복확인), USER는 검색으로 가입.

**승인 체인**: SUPERVISOR → ADMIN(+조직) 승인 → ADMIN → 같은 조직 USER 승인. 양쪽 active여야 정상 이용.

## 2. 단위 시험 (vitest, test/auth.test.ts) — 22/22

| ID | 시나리오 | 결과 |
|----|----------|------|
| TC-W1 | ADMIN 가입 → 조직 생성 + pending | ✅ |
| TC-W2 | 조직명 중복 거부(org_name_taken) | ✅ |
| TC-W3 | USER 가입 → 조직 선택 + pending | ✅ |
| TC-W4 | USER 잘못된 조직 거부 | ✅ |
| TC-W5 | SUPERVISOR 가입 금지 | ✅ |
| TC-W6 | pending 로그인 허용(토큰 status) | ✅ |
| TC-W7 | disabled/rejected 로그인 차단 | ✅ |
| TC-W8 | SUPERVISOR→ADMIN 승인 active | ✅ |
| TC-W9 | ADMIN→같은 조직 USER 승인 | ✅ |
| TC-W10 | ADMIN 타 조직 USER 승인 불가 | ✅ |
| TC-W11 | ADMIN의 ADMIN 승인 불가 | ✅ |
| TC-W12 | 반려 → rejected + 사유 | ✅ |
| TC-W13 | SUPERVISOR 역할/상태 변경 | ✅ |
| TC-W14 | 비-SUPERVISOR 변경 불가 | ✅ |
| TC-W15 | USER API문서 등록(inline) → pending | ✅ |
| TC-W16 | 소유자 수정 pending 재설정 / 비소유자 불가 | ✅ |
| TC-W17 | ADMIN 미리보기 정상(ok)+tools | ✅ |
| TC-W18 | ADMIN 승인 → approved + tools_count | ✅ |
| TC-W19 | ADMIN 반려 → rejected + 사유 | ✅ |
| TC-W20 | 타 조직 ADMIN 검토 불가 | ✅ |
| TC-W21 | 잘못된 inline 스펙 승인 거부 | ✅ |
| TC-W22 | TOTP 게이트 유지 | ✅ |
| TC-W23 | **개별 등록 모드** 생성 → baseUrl 필수 | ✅ |
| TC-W24 | 개별 endpoint 추가 → 합성 스펙 승인(`{param}` 자동·DELETE 제외→tools 2) | ✅ |
| TC-W25 | endpoint 추가 시 pending 재설정·삭제·소유자만 | ✅ |
| TC-W14b~d | ADMIN 같은 조직 USER 상태 변경 / 역할 변경 불가 / 타 조직 불가 | ✅ |

## 3. 라이브 풀체인 (Next dev :3012) — 10/10

| # | 단계 | 결과 |
|---|------|------|
| 1 | ADMIN 가입(조직 Acme) | pending, org=Acme ✅ |
| 1b | 조직 중복확인 | available=false ✅ |
| 2 | SUPERVISOR 로그인 | ✅ |
| 3 | SUPERVISOR→ADMIN 승인 | active ✅ |
| 4 | 조직 검색(USER 가입용) | orgId 반환 ✅ |
| 5 | USER 가입(검색 선택) | pending ✅ |
| 6 | ADMIN→USER 승인 | active ✅ |
| 7 | USER API문서 등록(inline) | docId 발급 ✅ |
| 8 | ADMIN 미리보기(요청확인) | ok=true, tools=1 ✅ |
| 9 | ADMIN 승인 | approved, toolsCount=1 ✅ |
| 10 | USER가 타인 승인 시도 | 403 ✅ |

### 3b. 개별 등록 모드 라이브 (Next dev :3015)

| # | 단계 | 결과 |
|---|------|------|
| 1 | 개별등록 문서 생성(endpoints, baseUrl) | docId ✅ |
| 2 | endpoint 3개 추가(GET·GET{isbn}·DELETE{isbn}) | 201×3 ✅ |
| 3 | endpoint 목록 | count 3 ✅ |
| 4 | ADMIN 미리보기(합성 스펙) | ok=true, tools=2, excluded=1(DELETE 위험) ✅ |
| 5 | ADMIN 승인 | approved, toolsCount=2 ✅ |

## 4. 엔드포인트

| 메서드·경로 | 권한 | 기능 |
|------------|------|------|
| `POST /api/auth/register` | 공개 | 가입 (role USER/ADMIN, orgName/orgId) |
| `GET /api/orgs/check?name=` | 공개 | 조직명 중복확인 |
| `GET /api/orgs/search?q=` | 공개 | 조직 검색 |
| `GET /api/users` | ADMIN(조직)/SUPERVISOR(전체) | 사용자 목록 |
| `POST /api/users/:id/approve` `…/reject` | ADMIN(조직 USER)/SUPERVISOR | 가입 승인/반려 |
| `PATCH /api/users/:id` | SUPERVISOR | 역할/상태 변경 |
| `GET/POST /api/apidocs` | active | 목록/등록 |
| `PATCH/DELETE /api/apidocs/:id` | 소유자 | 수정(→pending)/삭제 |
| `GET /api/apidocs/:id/preview` | ADMIN(조직)/SUPERVISOR | 요청 확인(URL fetch+변환) |
| `POST /api/apidocs/:id/approve` `…/reject` | ADMIN(조직)/SUPERVISOR | 승인/반려 |

## 5. 화면

`/register`(역할 선택·ADMIN 조직생성+중복확인·USER 조직검색) · `/(app)/apidocs`(USER CRUD) ·
`/(app)/approvals`(ADMIN/SUPERVISOR — 사용자·문서 승인, 미리보기 모달) · `/(app)/users`(SUPERVISOR 역할/상태) ·
`/(app)/dashboard`(pending 배너).

## 6. 발견·수정
- 스키마 변경(users.status enum 확장 + organizations/api_docs 추가) → dev DB(var/app.db, gitignore) 리셋.
- 기존 단위테스트(구 register 시그니처)는 신규 워크플로 기준으로 전면 재작성.

## 7. 결론
PRD §4.1 A1 + 두 워크플로(문서 승인 / 가입·조직·승인 체인) 구현·검증 완료. RBAC(SUPERVISOR/ADMIN/USER) + 조직 격리 + 승인 게이팅 단위 22 + 라이브 10 통과.
