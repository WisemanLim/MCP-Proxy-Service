# 샘플 FastAPI — items CRUD

GET/POST/PUT/DELETE 지원. MCP-Proxy 변환 테스트 대상.

## 실행
```bash
cd api-samples/fastapi
uv sync && uv run uvicorn main:app --port 8000 --reload
# 또는: pip install fastapi uvicorn && uvicorn main:app --port 8000
```

## 엔드포인트
| 메서드 | 경로 | operationId |
|--------|------|-------------|
| GET | `/items` | listItems |
| POST | `/items` | createItem |
| GET | `/items/{item_id}` | getItem |
| PUT | `/items/{item_id}` | updateItem |
| DELETE | `/items/{item_id}` | deleteItem |
| GET | `/health` | health |

## OpenAPI 스키마
- `http://localhost:8000/openapi.json` ← apps/web “① 스키마 링크” 모드에 입력
- Swagger UI: `http://localhost:8000/docs`
