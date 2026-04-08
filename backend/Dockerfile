# =============================================================================
# MediSync Backend - Production Dockerfile
# =============================================================================
# Multi-stage Build für optimale Image-Größe und Sicherheit
# =============================================================================

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS dependencies

# Sicherheitsupdates
RUN apk add --no-cache dumb-init

WORKDIR /app

# Package files zuerst kopieren (für bessere Caching)
COPY package*.json ./

# Production dependencies installieren
RUN npm ci --only=production && \
    npm cache clean --force

# =============================================================================
# Stage 2: Build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Alle dependencies für Build
COPY package*.json ./
RUN npm ci

# Source Code kopieren
COPY . .

# TypeScript kompilieren
RUN npm run build

# =============================================================================
# Stage 3: Production
# =============================================================================
FROM node:20-alpine AS production

# Metadata
LABEL maintainer="MediSync Team"
LABEL description="MediSync Agenten-Plattform Backend"
LABEL version="1.0.0"

# Sicherheitsupdates
RUN apk add --no-cache dumb-init ca-certificates && \
    addgroup -g 1000 -S medisync && \
    adduser -u 1000 -S medisync -G medisync

WORKDIR /app

# Production dependencies aus Stage 1 kopieren
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package*.json ./

# Kompilierte Dateien aus Stage 2 kopieren
COPY --from=builder /app/dist ./dist

# Non-root User
USER medisync:medisync

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV WS_PORT=8080

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Expose Ports
EXPOSE 3000 8080

# Verwende dumb-init für sauberes Signal-Handling
ENTRYPOINT ["dumb-init", "--"]

# Start
CMD ["node", "dist/server-secure.js"]
