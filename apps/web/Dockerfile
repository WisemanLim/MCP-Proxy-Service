# 빌드 컨텍스트 = repo root (pnpm workspace 전체 필요). compose: dockerfile=apps/web/Dockerfile
FROM node:20-slim
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @mcp-proxy/web build
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
