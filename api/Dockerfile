FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

# Create /data directory for SQLite database
RUN mkdir -p /data && chown -R node:node /data

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev

ENV PORT=4000
EXPOSE 4000

USER node
CMD ["node", "dist/index.js"]
