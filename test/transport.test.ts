import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseManifest } from "@mcp-proxy/manifest";
import { ProxyRuntime } from "@mcp-proxy/core";
import { buildMcpServer } from "../apps/api/src/server.js";
import { baseManifest, petstoreSpec } from "./fixtures/petstore.js";

const manifest = parseManifest(baseManifest);

async function connect(runtime: ProxyRuntime): Promise<Client> {
  const server = buildMcpServer(runtime);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  return client;
}

describe("MCP transport (C3,C4,D5)", () => {
  beforeEach(() => {
    process.env.PETSTORE_API_KEY = "key-abc";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.PETSTORE_API_KEY;
  });

  it("TC-C3-1 tools/list (위험 endpoint 제외 반영)", async () => {
    const client = await connect(new ProxyRuntime(petstoreSpec, manifest));
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["listPets", "getPet", "createPet"]));
    expect(names).not.toContain("adminStats");
    expect(names).not.toContain("deletePet");
  });

  it("TC-C4-1 call_tool data+meta 반환", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }]), { status: 200 }),
    ));
    const client = await connect(new ProxyRuntime(petstoreSpec, manifest));
    const res = await client.callTool({ name: "listPets", arguments: {} });
    const payload = JSON.parse((res.content as Array<{ text: string }>)[0].text);
    expect(payload.data.length).toBe(2); // defaultLimit
    expect(payload.meta.totalCount).toBe(3);
  });

  it("TC-C4-2 call_tool 에러 → isError + 구조화 코드", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const m = parseManifest({ ...baseManifest, retry: { max: 0 } });
    const client = await connect(new ProxyRuntime(petstoreSpec, m));
    const res = await client.callTool({ name: "getPet", arguments: { id: 1 } });
    expect(res.isError).toBe(true);
    const payload = JSON.parse((res.content as Array<{ text: string }>)[0].text);
    expect(payload.error.code).toBe("INVALID_API_KEY");
  });
});
