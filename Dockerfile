# GitHub Monitor — zero-dependency Node.js dashboard.
#
# The server uses only Node built-ins (no npm install needed at runtime), so the
# image is just Node + the two files the app serves.
FROM node:22-alpine

WORKDIR /app

# The server + static assets are all that's needed to run.
COPY server.js ./
COPY public/ public/

# Non-root user. Pre-create the history directory so the mounted volume below
# inherits write access for this user.
RUN addgroup -S githubmonitor && \
    adduser -S githubmonitor -G githubmonitor && \
    mkdir -p /app/history && \
    chown -R githubmonitor:githubmonitor /app

USER githubmonitor

ENV PORT=4177 \
    HOST=0.0.0.0 \
    HISTORY_DIR=/app/history

EXPOSE 4177

# Built-in endpoint used to confirm the server is up.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4177/api/health >/dev/null 2>&1 || exit 1

# `npm start` is just `node server.js`.
CMD ["node", "server.js"]
