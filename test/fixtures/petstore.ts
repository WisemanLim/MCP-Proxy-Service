/** 테스트용 OpenAPI v3 스펙 + manifest 픽스처. $ref·다양한 파라미터·위험 endpoint 포함. */

export const petstoreSpec = {
  openapi: "3.0.3",
  info: { title: "Petstore", version: "1.0.0" },
  servers: [{ url: "https://api.example.com/v1" }],
  components: {
    parameters: {
      LimitParam: { name: "limit", in: "query", required: false, schema: { type: "integer" } },
    },
    schemas: {
      Pet: {
        type: "object",
        properties: { id: { type: "integer" }, name: { type: "string" }, tag: { type: "string" } },
        required: ["id", "name"],
      },
      NewPet: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
      bearer: { type: "http", scheme: "bearer" },
    },
  },
  security: [{ apiKey: [] }],
  paths: {
    "/pets": {
      parameters: [{ $ref: "#/components/parameters/LimitParam" }],
      get: {
        operationId: "listPets",
        summary: "목록 조회",
        tags: ["pets"],
        parameters: [{ name: "tag", in: "query", required: false, schema: { type: "string" } }],
        responses: { "200": { description: "ok" } },
      },
      post: {
        operationId: "createPet",
        summary: "생성",
        tags: ["pets"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/NewPet" } } },
        },
        responses: { "201": { description: "created" } },
      },
    },
    "/pets/{id}": {
      get: {
        operationId: "getPet",
        summary: "단건 조회",
        tags: ["pets"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "ok" } },
      },
      delete: {
        operationId: "deletePet",
        summary: "삭제",
        tags: ["pets"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "204": { description: "no content" } },
      },
    },
    "/admin/stats": {
      get: {
        operationId: "adminStats",
        summary: "관리자 통계",
        tags: ["admin"],
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

export const baseManifest = {
  name: "petstore",
  baseUrl: "https://api.example.com/v1",
  specAuth: {
    schemes: [
      { name: "apiKey", type: "apiKey", in: "header", paramName: "X-API-Key" },
      { name: "bearer", type: "http", scheme: "bearer" },
    ],
  },
  runtimeAuthPolicy: { secretRef: "PETSTORE_API_KEY" },
  fieldsPolicy: { defaultLimit: 2, truncateBytes: 16, maxDepth: 2, allow: [] },
};
