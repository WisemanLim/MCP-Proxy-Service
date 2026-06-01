import { readFileSync } from "node:fs";
import { loadSpecFromFile, loadSpecFromUrl, type OpenAPISpec } from "@mcp-proxy/converter";
import { parseManifest, type Manifest } from "@mcp-proxy/manifest";
import { ProxyRuntime } from "./core/index.js";

/** C2 설정 로드: MANIFEST_PATH(json) + spec(파일/URL). */
export async function loadRuntimeFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<ProxyRuntime> {
  const manifestPath = env.MANIFEST_PATH;
  if (!manifestPath) throw new Error("MANIFEST_PATH 미설정");
  const manifest: Manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));

  let spec: OpenAPISpec;
  if (env.SPEC_PATH) spec = loadSpecFromFile(env.SPEC_PATH);
  else if (manifest.specUrl) spec = await loadSpecFromUrl(manifest.specUrl);
  else throw new Error("SPEC_PATH 또는 manifest.specUrl 필요");

  return new ProxyRuntime(spec, manifest);
}
