# MediSync Dashboard - Dockerfile
# ================================

# Build Stage
FROM node:20-alpine AS builder

# Arbeitsverzeichnis
WORKDIR /app

# Kopiere Package Files
COPY package*.json ./

# Installiere Dependencies
RUN npm ci

# Kopiere Source Code
COPY . .

# Baue die Anwendung
RUN npm run build

# Production Stage (nginx)
FROM nginx:alpine AS production

# Kopiere Build-Output
COPY --from=builder /app/dist /usr/share/nginx/html

# Kopiere nginx Konfiguration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponiere Port
EXPOSE 80

# Health Check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
