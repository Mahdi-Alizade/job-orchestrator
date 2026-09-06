# Stage 1: Build source code with dev dependencies
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --production

# Stage 2: Hardened, lean production runner
FROM node:20-alpine

RUN apk add --no-cache docker-cli tini git
WORKDIR /app

# Setup isolated runtime non-root user and docker group mapping
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs && \
    addgroup -g 999 -S docker && \
    addgroup nestjs docker

COPY --chown=nestjs:nodejs --from=builder /app/dist ./dist
COPY --chown=nestjs:nodejs --from=builder /app/node_modules ./node_modules
COPY --chown=nestjs:nodejs package.json ./

USER nestjs

EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main.js"]