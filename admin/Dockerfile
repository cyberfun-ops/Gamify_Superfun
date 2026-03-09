# ── Stage 1: Build React admin UI ─────────────────────────────────────────────
FROM node:20-alpine AS ui-builder
WORKDIR /build

COPY admin/client/package*.json ./
RUN npm install --legacy-peer-deps

COPY admin/client/ .
RUN npm run build

# ── Stage 2: Run Express server + serve built UI ──────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY admin/server/package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY admin/server/ ./server/
COPY --from=ui-builder /build/dist ./public/

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

USER node

CMD ["node", "server/index.js"]
