# Media Bridge — lightweight RTP ↔ Gemini Live bridge
# Runs on the Drachtio VM alongside the SIP daemon

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY *.ts ./
COPY tsconfig.json ./
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init curl
RUN addgroup -g 1001 -S bridge && adduser -S bridge -u 1001
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN chown -R bridge:bridge /app
USER bridge

EXPOSE 8090
EXPOSE 10000-20000/udp

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8090/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]