# MediSync Discord Bot - Dockerfile
# =================================

FROM node:20-alpine AS base

# Installiere System-Dependencies
RUN apk add --no-cache ca-certificates

# Arbeitsverzeichnis
WORKDIR /app

# Kopiere Package Files
COPY package*.json ./

# Installiere Dependencies
RUN npm ci --only=production && npm cache clean --force

# Production Stage
FROM node:20-alpine AS production

# Sicherheit: Nicht-Root User
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Arbeitsverzeichnis
WORKDIR /app

# Kopiere Dependencies
COPY --from=base /app/node_modules ./node_modules

# Kopiere kompilierte Dateien
COPY --chown=nodejs:nodejs dist ./dist
COPY --chown=nodejs:nodejs package.json ./

# Logs Verzeichnis
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

# User wechseln
USER nodejs

# Health Check (Discord Bots können via Gateway Ping geprüft werden)
# Wir prüfen einfach ob der Prozess läuft
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
    CMD pgrep -f "node dist/bot.js" || exit 1

# Start Command
CMD ["node", "dist/bot.js"]
