FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json serverless.yml ./
COPY resources ./resources
COPY src ./src

EXPOSE 3000

CMD ["npx", "serverless", "offline"]
