FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_STORY_READER_URL=http://localhost:3000
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_STORY_READER_URL=$NEXT_PUBLIC_STORY_READER_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx next build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3001
CMD ["npm", "run", "start:lan"]
