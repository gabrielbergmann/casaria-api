# syntax=docker/dockerfile:1
# Imagem da API. Sem segredo em ARG/ENV: variáveis entram no runtime, e a migration roda ao subir.

FROM node:26.12.1-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# O Node 26 não traz Corepack; única exceção ao uso de npm (constituição).
RUN npm install -g pnpm@10.32.1
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm prisma generate && pnpm build && pnpm prune --prod --ignore-scripts

FROM node:26.12.1-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Schema, migrations e config do Prisma: a migration roda a cada subida, antes da API.
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./
USER node
EXPOSE 3000
# migrate deploy só aplica as migrations novas; se falhar, a API não sobe com o banco desatualizado.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
