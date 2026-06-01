# 시험 결과 — apps/web 인증 (회원가입·로그인·TOTP·SUPERVISOR)

> **참고**: 본 문서는 1차 인증(기본 가입/로그인/TOTP) 결과다. 이후 조직·승인 워크플로 추가로
> `test/auth.test.ts`는 22개 워크플로 케이스(TC-W*)로 재작성됨 → 최신 결과는 [RESULTS-workflow.md](./RESULTS-workflow.md) 참조.
> 아래 TC-AUTH-* 항목은 워크플로 케이스에 흡수되었다(가입/로그인/TOTP/부트스트랩 동일 검증).

| 항목 | 값 |
|------|-----|
| 실행일 | 2026-06-01 |
| 참고 구현 | DocuGuard-AI-Admin (NestJS+otplib+JWT) → Next.js route handlers로 이식 |
| 스택 | Next.js 15 route handlers · node:sqlite(빌트인) · bcryptjs · otplib · jose(JWT) |
| 결과 | **단위 12/12 PASS · 라이브 HTTP 6/6 PASS** |

## 1. 역할 모델

`SUPERVISOR`(기본관리자) > `ADMIN`(관리자) > `USER`(사용자). 공개 회원가입은 `USER`. 관리자 생성은 SUPERVISOR가 `/api/users`. SUPERVISOR는 `.env`로 초기 부트스트랩.

## 2. 단위 시험 (vitest, test/auth.test.ts) — 12/12

| ID | 시나리오 | 기대 | 결과 |
|----|----------|------|------|
| TC-AUTH-1 | 회원가입 USER + 해시저장 + TOTP secret | role=USER, hash≠평문, qr=data:image | ✅ |
| TC-AUTH-2 | 중복 이메일 거부 | AuthError | ✅ |
| TC-AUTH-3 | 짧은 비밀번호 거부 | password_too_short | ✅ |
| TC-AUTH-4 | ADMIN 역할 지정 생성 | role=ADMIN | ✅ |
| TC-AUTH-5 | 정상 로그인 → JWT(role) | verifyToken claims | ✅ |
| TC-AUTH-6 | 잘못된 비밀번호 | invalid_credentials | ✅ |
| TC-AUTH-7 | 없는 사용자 | invalid_credentials | ✅ |
| TC-AUTH-8 | TOTP 활성 후 코드 없는 로그인 거부 / 코드 제공 성공 | totp_required → 성공 | ✅ |
| TC-AUTH-9 | 잘못된 TOTP 활성화 거부 | AuthError | ✅ |
| TC-AUTH-10 | SUPERVISOR .env 부트스트랩 생성 | role=SUPERVISOR | ✅ |
| TC-AUTH-11 | 부트스트랩 멱등 | 재생성 안 함 | ✅ |
| TC-AUTH-12 | env 미설정 시 미생성 | 0 users | ✅ |

## 3. 라이브 HTTP 시험 (Next dev :3010) — 6/6

| # | 요청 | 기대 | 실제 |
|---|------|------|------|
| 1 | SUPERVISOR 로그인(.env 부트스트랩 계정) | role=SUPERVISOR + JWT | ✅ tokenLen 221, 로그 `SUPERVISOR bootstrapped` |
| 2 | USER 회원가입 | role=USER, TOTP secret 발급 | ✅ totpEnabled=false, secretLen=16 |
| 3 | USER 로그인 | JWT 발급 | ✅ tokenLen 199 |
| 4 | `GET /api/auth/me` (Bearer) | 본인 정보 | ✅ {role:USER,...} |
| 5 | USER → `GET /api/users` | 403 forbidden (RBAC) | ✅ 403 |
| 6 | SUPERVISOR → `GET /api/users` | 200 | ✅ 200 |

## 4. 발견·수정 이력

| # | 증상 | 원인 | 수정 |
|---|------|------|------|
| 1 | better-sqlite3 설치 실패 (node-gyp, Node 26) | 네이티브 빌드 비호환 | **node:sqlite**(Node 22+ 빌트인)로 교체, 네이티브 의존 제거 |
| 2 | vitest `Failed to load url sqlite` | vite 5 builtin 목록에 node:sqlite 없음 + 소스 인라인 정적분석 | `createRequire(import.meta.url)("node:sqlite")` 런타임 로드로 회피 |
| 3 | Next 빌드 `Can't resolve './config.js'` | Next webpack은 `.js`→`.ts` 매핑 안 함 | web lib 상대 import의 `.js` 확장자 제거 |
| 4 | 단위테스트 otplib/server-only 로드 실패 | pnpm 격리 + server-only 패키지 throw | 루트 devDeps에 otplib 추가, `server-only`를 빈 stub로 alias |

## 5. 환경 변수 (apps/web/.env)

| 키 | 용도 |
|----|------|
| `SUPERVISOR_EMAIL` / `SUPERVISOR_PASSWORD` | 기본관리자 초기 설정 — 둘 다 있으면 첫 부팅 1회 생성 |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | JWT 서명·만료 |
| `BCRYPT_ROUNDS` | 비밀번호 해시 라운드 |
| `TOTP_ISSUER` | 인증 앱 표시 발급자명 |
| `SQLITE_PATH` | 사용자 DB 경로 (node:sqlite) |

## 6. 재현

```bash
# apps/web/.env.local 에 SUPERVISOR_EMAIL/PASSWORD 설정 후
pnpm --filter @mcp-proxy/web dev   # 또는 make dev
# 첫 부팅 로그: [auth] SUPERVISOR bootstrapped: ...
pnpm test                          # 단위 61 (auth 12 포함)
```

## 7. 결론

요구 1(회원가입·로그인·TOTP) + 요구 2(SUPERVISOR .env 초기설정) 구현·검증 완료. 비밀번호 bcrypt 해시, TOTP otplib(QR 발급+검증), JWT(jose), 역할기반 접근제어(RBAC). 단위 12 + 라이브 6 = 18 시나리오 전부 통과.
