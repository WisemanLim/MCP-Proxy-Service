"""extractor 시험 (PRD §4.6 F2/F4/F6). pytest 없이도 실행: python3 test_extractor.py"""
import sys
from pathlib import Path

# python/extractor 모듈 경로 추가
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python" / "extractor"))

from extractor import build_ir, extraction_result, validate_openapi  # noqa: E402

VALID_SPEC = {
    "openapi": "3.0.3",
    "paths": {
        "/pets": {
            "get": {
                "operationId": "listPets",
                "summary": "목록",
                "responses": {"200": {"description": "ok"}},
            }
        }
    },
}


def test_f4_valid_spec():
    r = validate_openapi(VALID_SPEC)
    assert r["valid"] is True, r
    assert r["errors"] == []


def test_f4_missing_responses():
    spec = {"openapi": "3.0.0", "paths": {"/x": {"get": {"summary": "no resp"}}}}
    r = validate_openapi(spec)
    assert r["valid"] is False
    assert any("responses" in e for e in r["errors"]), r


def test_f4_broken_ref():
    spec = {
        "openapi": "3.0.0",
        "paths": {
            "/x": {
                "get": {
                    "parameters": [{"$ref": "#/components/parameters/Missing"}],
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
    }
    r = validate_openapi(spec)
    assert r["valid"] is False
    assert any("$ref" in e for e in r["errors"]), r


def test_f2_ir():
    ir = build_ir(VALID_SPEC)
    assert len(ir) == 1
    assert ir[0]["path"] == "/pets"
    assert ir[0]["method"] == "get"
    assert ir[0]["confidence"] >= 0.6  # summary+operationId+responses


def test_f6_unresolved():
    # responses 없는 저신뢰 endpoint → unresolved
    spec = {"openapi": "3.0.0", "paths": {"/y": {"get": {}}}}
    out = extraction_result(spec)
    assert out["valid"] is False
    assert len(out["unresolved"]) >= 1, out


def _run():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for t in tests:
        t()
        print(f"  PASS {t.__name__}")
        passed += 1
    print(f"\npython extractor: {passed}/{len(tests)} passed")


if __name__ == "__main__":
    _run()
