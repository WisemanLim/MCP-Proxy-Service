# mcpctl — MCP Proxy CLI

웹포털 없이 **JSON 정의 + curl** 로 REST API 를 MCP 로 등록·승인한다.
전체 플랫폼 흐름이 이미 Bearer 토큰 REST 라 별도 서버 변경 없이 동작한다.

- 의존성: `bash` `curl` `jq` (macOS/Linux 기본 또는 `brew install jq`)
- 대상 웹: 기본 `http://localhost:3000` (환경변수 `MCP_PROXY_URL` 또는 `login -u` 로 변경)
- 세션 저장: `~/.mcpproxy/<profile>.json` (권한 600). `-P` 로 프로파일 분리 (User/Admin 동시 사용).

## 설치

```bash
chmod +x cli/mcpctl
# 선택: PATH 등록
ln -s "$PWD/cli/mcpctl" /usr/local/bin/mcpctl
```

## 역할별 흐름

| 역할 | 가능 동작 |
|------|-----------|
| USER | 로그인 · API 등록(url/endpoints/inline) · 본인 문서 목록 |
| ADMIN | 위 + **같은 조직** 문서 승인 대기 확인·미리보기·승인/반려 |
| SUPERVISOR | 위 + **전체** 조직 대상 |

> 등록 과정은 USER·ADMIN·SUPERVISOR 동일. 승인은 ADMIN(같은 조직)·SUPERVISOR(전체)만.

## JSON 정의 포맷

세 가지 모드. 공통 필드 `name`(필수), `mode`, 선택 `proxyPort`(비우면 승인 시 자동 할당).

### ① 스키마 링크 (`mode: "url"`) — [examples/schema-link.json](examples/schema-link.json)
```json
{ "name": "petstore-cli", "mode": "url",
  "sourceRef": "http://localhost:8000/openapi.json", "baseUrl": "http://localhost:8000" }
```

### ② 개별 등록 (`mode: "endpoints"`) — [examples/endpoints.json](examples/endpoints.json)
`baseUrl` 필수. `path` 의 `{param}` 은 path 파라미터 자동 합성.
```json
{ "name": "books-cli", "mode": "endpoints", "baseUrl": "http://localhost:8000",
  "endpoints": [
    { "method": "GET",  "path": "/books",      "summary": "list books" },
    { "method": "GET",  "path": "/books/{id}", "summary": "get book" },
    { "method": "POST", "path": "/books",      "summary": "create book" }
  ] }
```

### ③ inline 스펙 (`mode: "inline"`) — [examples/inline.json](examples/inline.json)
`spec` 에 OpenAPI 객체 직접.

## 명령

```
전역: -P <profile>  세션 프로파일 (기본 default)
      -u <url>      웹 베이스 URL (login)

login   -e <email> -p <password> [-t <totp>] [-u <url>]
whoami
logout
register -f <정의.json>
list
pending
preview <id>
approve <id>
reject  <id> -r <reason>
```

## 전체 예시 (User 등록 → Admin 승인)

```bash
# USER: 로그인 + 등록
./cli/mcpctl -P user login -e us@x.com -p us1234
./cli/mcpctl -P user register -f cli/examples/endpoints.json
#   → 등록: id=doc_xxx name=books-cli mode=endpoints status=pending

# ADMIN: 승인 대기 확인 → 미리보기 → 해당 문서만 승인
./cli/mcpctl -P admin login -e ad@x.com -p ad1234
./cli/mcpctl -P admin pending
./cli/mcpctl -P admin preview doc_xxx     # 변환 tools·upstream 도달성 확인
./cli/mcpctl -P admin approve doc_xxx
#   → 승인 OK: ... status=approved tools=3 port=25655  (프록시 자동 기동)

# 반려
./cli/mcpctl -P admin reject doc_xxx -r "스펙 비정상"
```

TOTP 활성 계정은 `login -t <6자리>`.

## 원시 curl 레시피 (스크립트 없이)

```bash
URL=http://localhost:3000

# 1) 로그인 → 토큰
TOKEN=$(curl -s -X POST "$URL/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"us@x.com","password":"us1234"}' | jq -r .token)

# 2a) 스키마 링크 등록
curl -s -X POST "$URL/api/apidocs" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"petstore-cli","sourceType":"url","sourceRef":"http://localhost:8000/openapi.json","baseUrl":"http://localhost:8000"}'

# 2b) 개별 등록 — 문서 생성 후 endpoint 추가
ID=$(curl -s -X POST "$URL/api/apidocs" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"books-cli","sourceType":"endpoints","baseUrl":"http://localhost:8000"}' | jq -r .id)
curl -s -X POST "$URL/api/apidocs/$ID/endpoints" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"method":"GET","path":"/books","summary":"list"}'

# 3) ADMIN: 승인 대기 → 승인
ATOK=$(curl -s -X POST "$URL/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"ad@x.com","password":"ad1234"}' | jq -r .token)
curl -s "$URL/api/apidocs" -H "Authorization: Bearer $ATOK" \
  | jq '.items[] | select(.status=="pending") | {id,name}'
curl -s -X POST "$URL/api/apidocs/$ID/approve" -H "Authorization: Bearer $ATOK"
```

## 매핑 (CLI → REST)

| CLI | 엔드포인트 |
|-----|-----------|
| `login` | `POST /api/auth/login` |
| `whoami` | `GET /api/auth/me` |
| `register` (url/inline) | `POST /api/apidocs` |
| `register` (endpoints) | `POST /api/apidocs` → `POST /api/apidocs/:id/endpoints` (반복) |
| `list` | `GET /api/apidocs` |
| `pending` | `GET /api/apidocs` (status=pending 필터) |
| `preview` | `GET /api/apidocs/:id/preview` |
| `approve` | `POST /api/apidocs/:id/approve` |
| `reject` | `POST /api/apidocs/:id/reject` |

승인 시 변환 검증(tools 수 기록) + **20000+ 빈 포트 자동 할당** + 프록시 자동 기동.
이후 MCP 클라이언트 등록은 웹 "가이드" 또는 `GET /api/apidocs/:id/openapi.json` 참고.
