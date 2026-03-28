FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY esbuild.config.mjs tsconfig.json ./
COPY src ./src
RUN npm run build

CMD ["node", "dist/index.js"]
