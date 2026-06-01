# api-samples

MCP-Proxy 변환 테스트용 샘플 REST API. GET/POST/PUT/DELETE CRUD 제공.

| 샘플 | 스키마 URL | 등록 모드 |
|------|-----------|-----------|
| [fastapi](./fastapi) | `http://localhost:8000/openapi.json` | ① 스키마 링크 |
| [spring-boot](./spring-boot) | `http://localhost:8080/v3/api-docs` | ① 스키마 링크 |

각 디렉터리 README 참고. apps/web “API 문서 → 스키마 링크” 모드에 위 URL 입력 → ADMIN 미리보기·승인으로 MCP tool 변환 확인.
개별 endpoint를 직접 추가하려면 “② 개별 등록” 모드 사용.
