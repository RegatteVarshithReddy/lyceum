# --- Stage 1: build the frontend -----------------------------------------
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
# Outputs to ../backend/public per frontend/vite.config.js
RUN npm run build

# --- Stage 2: backend + built frontend ------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app/backend
# better-sqlite3 compiles a native addon on install; keep build tools only in
# this layer (not shipped separately) in case the prebuilt binary doesn't
# match the image's node/libc combination.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json ./
# Force a source build: better-sqlite3's prebuilt binary is linked against a
# newer glibc than bookworm-slim ships, which crashes at runtime with
# "GLIBC_2.38 not found" even though the prebuild download itself succeeds.
RUN npm_config_build_from_source=true npm install --omit=dev
COPY backend/ ./
COPY --from=frontend-build /app/backend/public ./public

ENV NODE_ENV=production
EXPOSE 4100
CMD ["node", "server.js"]
