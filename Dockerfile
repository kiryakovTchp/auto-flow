FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

COPY ui/package.json ui/package-lock.json* ./ui/
RUN npm ci --prefix ui

COPY ui ./ui
RUN npm run build --prefix ui


FROM node:20-bullseye-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates bash \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:/root/.local/bin:${PATH}"

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

# SQL migrations are loaded from src/db/sql at runtime.
COPY src/db/sql ./src/db/sql

EXPOSE 3000
CMD ["node", "dist/server.js"]
