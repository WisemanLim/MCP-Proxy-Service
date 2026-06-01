/**
 * 비정형 문서 → OpenAPI 추출 오케스트레이션 (PRD §4.6).
 * 3중 구조: LLM 초안 + 정적 검증 + 규칙/인간 보정.
 * 무거운 LLM 배치는 python/extractor 로 위임.
 */
export interface ExtractionResult {
  spec: unknown;
  confidenceMap: Record<string, number>;
  unresolved: string[];
}

export async function extractOpenApi(_input: string): Promise<ExtractionResult> {
  // TODO(M5): DOM 수집 → IR → LLM fragment → 병합 → validator → confidence map
  return { spec: null, confidenceMap: {}, unresolved: [] };
}
