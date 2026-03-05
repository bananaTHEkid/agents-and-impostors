FROM node:25-slim AS deps
WORKDIR /app
# Build tools and sqlite headers for native module compile
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ libsqlite3-dev && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# Force rebuild of native deps (sqlite3) against glibc
ENV npm_config_build_from_source=1
RUN npm ci

FROM node:25-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:25-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
EXPOSE 5001
CMD ["npm", "run", "start"]
