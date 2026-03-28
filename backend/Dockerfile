FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json esbuild.config.mjs ./
COPY src ./src

ENV NODE_ENV=production
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
