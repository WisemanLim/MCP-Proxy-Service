"""비정형 → OpenAPI 추출 핵심 로직 (PRD §4.6). 순수 stdlib — 외부 의존 없음.

- F2 구조 추출: build_ir (endpoint/method/auth/params/confidence IR)
- F4 정적 검증: validate_openapi (syntax·$ref·required)
- F6 산출물: extraction_result (confidence_map + unresolved questions)
"""
from __future__ import annotations

from typing import Any

HTTP_METHODS = ("get", "put", "post", "delete", "patch", "head", "options")


def _resolve_ref(spec: dict, ref: str) -> Any:
    if not ref.startswith("#/"):
        raise ValueError(f"외부 $ref 미지원: {ref}")
    cur: Any = spec
    for part in ref[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(cur, dict) or part not in cur:
            raise KeyError(ref)
        cur = cur[part]
    return cur


def validate_openapi(spec: dict) -> dict:
    """F4 정적 검증. 반환: {valid, errors[]}."""
    errors: list[str] = []

    version = spec.get("openapi")
    if not isinstance(version, str) or not version.startswith("3"):
        errors.append(f"openapi v3 아님: {version!r}")

    paths = spec.get("paths")
    if not isinstance(paths, dict) or not paths:
        errors.append("paths 누락 또는 빈 객체")
        return {"valid": False, "errors": errors}

    for path, item in paths.items():
        if not isinstance(item, dict):
            errors.append(f"{path}: path item이 객체 아님")
            continue
        for method in HTTP_METHODS:
            op = item.get(method)
            if op is None:
                continue
            if "responses" not in op:
                errors.append(f"{method.upper()} {path}: responses 누락")
            # $ref 해석 검증
            for ref in _collect_refs(op):
                try:
                    _resolve_ref(spec, ref)
                except (KeyError, ValueError):
                    errors.append(f"{method.upper()} {path}: $ref 해석 실패 {ref}")

    return {"valid": len(errors) == 0, "errors": errors}


def _collect_refs(obj: Any) -> list[str]:
    refs: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "$ref" and isinstance(v, str):
                refs.append(v)
            else:
                refs.extend(_collect_refs(v))
    elif isinstance(obj, list):
        for v in obj:
            refs.extend(_collect_refs(v))
    return refs


def build_ir(spec: dict) -> list[dict]:
    """F2 중간표현(IR). operation별 구조 추출 + confidence."""
    ir: list[dict] = []
    schemes = list((spec.get("components", {}).get("securitySchemes", {}) or {}).keys())
    paths = spec.get("paths", {})
    for path, item in paths.items():
        if not isinstance(item, dict):
            continue
        for method in HTTP_METHODS:
            op = item.get(method)
            if not op:
                continue
            params = [
                {"name": p.get("name"), "in": p.get("in"), "required": p.get("required", False)}
                for p in op.get("parameters", [])
                if isinstance(p, dict)
            ]
            sec = [list(s.keys())[0] for s in op.get("security", []) if s] or schemes
            # confidence: summary·operationId·responses 보유로 가산
            conf = 0.4
            if op.get("summary"):
                conf += 0.2
            if op.get("operationId"):
                conf += 0.2
            if op.get("responses"):
                conf += 0.2
            ir.append(
                {
                    "path": path,
                    "method": method,
                    "summary": op.get("summary"),
                    "auth": sec,
                    "parameters": params,
                    "confidence": round(conf, 2),
                }
            )
    return ir


def extraction_result(spec: dict, conf_threshold: float = 0.6) -> dict:
    """F6 최종 산출물: validation + IR + confidence_map + unresolved."""
    validation = validate_openapi(spec)
    ir = build_ir(spec)
    confidence_map = {f"{e['method'].upper()} {e['path']}": e["confidence"] for e in ir}
    unresolved = [k for k, c in confidence_map.items() if c < conf_threshold]
    unresolved += [f"validation: {e}" for e in validation["errors"]]
    return {
        "spec": spec,
        "valid": validation["valid"],
        "errors": validation["errors"],
        "ir": ir,
        "confidence_map": confidence_map,
        "unresolved": unresolved,
    }
