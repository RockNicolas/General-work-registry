# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- build do Next em modo standalone ---
FROM deps AS build
COPY . .
ENV NEXT_OUTPUT=standalone
RUN pnpm build

# --- app web ---
FROM node:22-alpine AS app
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# --- worker pg-boss (usa tsx com as dependências completas; vira bundle quando a Fase 5 existir) ---
FROM deps AS worker
COPY . .
ENV NODE_ENV=production
USER node
CMD ["pnpm", "worker:prod"]
