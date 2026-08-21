# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter api build
RUN pnpm --filter api --prod deploy /output/api --legacy

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=5000

WORKDIR /app
COPY --from=build --chown=node:node /output/api ./

USER node
EXPOSE 5000

CMD ["node", "dist/src/main.js"]
