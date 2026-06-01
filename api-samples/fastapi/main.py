"""샘플 FastAPI — items CRUD (GET/POST/PUT/DELETE).

MCP-Proxy 변환 테스트 대상. OpenAPI 스키마: http://localhost:8000/openapi.json
실행: uv run uvicorn main:app --reload  (또는 uvicorn main:app --port 8000)
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Sample BookCollection API", version="1.0.0")

# 인메모리 저장소
_items: dict[int, "Item"] = {}
_seq = {"id": 0}


class ItemIn(BaseModel):
    name: str
    price: float = 0.0


class Item(ItemIn):
    id: int


@app.get("/items", operation_id="listItems", summary="아이템 목록")
def list_items() -> list[Item]:
    return list(_items.values())


@app.post("/items", operation_id="createItem", summary="아이템 생성", status_code=201)
def create_item(body: ItemIn) -> Item:
    _seq["id"] += 1
    item = Item(id=_seq["id"], **body.model_dump())
    _items[item.id] = item
    return item


@app.get("/items/{item_id}", operation_id="getItem", summary="아이템 단건")
def get_item(item_id: int) -> Item:
    if item_id not in _items:
        raise HTTPException(status_code=404, detail="not_found")
    return _items[item_id]


@app.put("/items/{item_id}", operation_id="updateItem", summary="아이템 수정")
def update_item(item_id: int, body: ItemIn) -> Item:
    if item_id not in _items:
        raise HTTPException(status_code=404, detail="not_found")
    item = Item(id=item_id, **body.model_dump())
    _items[item_id] = item
    return item


@app.delete("/items/{item_id}", operation_id="deleteItem", summary="아이템 삭제", status_code=204)
def delete_item(item_id: int) -> None:
    _items.pop(item_id, None)


@app.get("/health", operation_id="health", summary="헬스체크")
def health() -> dict[str, str]:
    return {"status": "ok"}
