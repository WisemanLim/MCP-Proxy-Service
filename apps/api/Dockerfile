# 빌드 컨텍스트 = repo root (pnpm workspace 전체 필요). compose: dockerfile=apps/api/Dockerfile
FROM node:20-slim
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @mcp-proxy/api build
WORKDIR /app/apps/api
EXPOSE 8080
CMD ["node", "dist/main.js"]
