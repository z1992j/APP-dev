FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

FROM node:20-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@10
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
