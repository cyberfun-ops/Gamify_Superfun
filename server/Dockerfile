# ── Stage: runtime ────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy manifests first — Docker layer cache means npm ci only
# re-runs when package.json or package-lock.json actually change.
COPY package.json package-lock.json ./

# Reproducible install, no dev dependencies
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/

# Tell Express we're in production (morgan uses 'combined' log format,
# db.js silences query debug logs)
ENV NODE_ENV=production

# The port src/index.js listens on
EXPOSE 3000

# Docker health check — alpine ships wget, not curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run as the built-in non-root user
USER node

CMD ["node", "src/index.js"]
