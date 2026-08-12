# Multi-stage production build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .
RUN npm run build

# Final production image
FROM node:20-alpine

RUN apk add --no-cache docker tini git
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Security: Run as non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001
USER nestijs

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main.js"]