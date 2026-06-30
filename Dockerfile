# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

COPY --from=builder /app/dist ./dist
COPY server ./server

EXPOSE 80

CMD ["node", "server/index.js"]
