"""LLM 스펙 추출 서비스 (PRD §4.6). 3중 구조: LLM 초안 + 정적 검증 + 보정."""
from fastapi import FastAPI

from extractor import extraction_result, validate_openapi

app = FastAPI(title="mcp-proxy-extractor")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/validate")
def validate(spec: dict) -> dict:
    """F4 정적 검증 endpoint."""
    return validate_openapi(spec)


@app.post("/extract")
def extract(spec: dict) -> dict:
    """F6 추출 산출물 (validation + IR + confidence + unresolved)."""
    return extraction_result(spec)
