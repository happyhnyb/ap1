FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 mandi

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --chown=mandi:nodejs src/ ./src/

# Snapshot data directory — mount a volume here in production
RUN mkdir -p data/snapshots && chown -R mandi:nodejs data/

USER mandi
EXPOSE 4000

CMD ["node", "src/server.js"]
