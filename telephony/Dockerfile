FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build
RUN npm run build

# Remove devDependencies
RUN npm prune --production

# Runtime
ENV NODE_ENV=production
EXPOSE 3100

CMD ["node", "dist/index.js"]
