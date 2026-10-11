# Builds the MCP server (mcp/) from this repository. Used by directories such
# as Glama that start the server in a container and check that it answers
# initialize / tools/list. The browser is launched only on the first scan.
#
#   docker build -t a11yscope-mcp .
#   docker run -i --rm a11yscope-mcp        # speaks MCP over stdio
FROM node:22-slim

# Chromium so scans work inside the container; introspection needs no browser.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV A11YSCOPE_CHROME=/usr/bin/chromium

WORKDIR /app
# The engine is copied from src/ into mcp/engine by mcp/sync.mjs (same as prepack).
COPY package.json ./
COPY src ./src
COPY mcp ./mcp
WORKDIR /app/mcp
RUN npm ci --omit=dev --ignore-scripts && node sync.mjs

ENTRYPOINT ["node", "/app/mcp/server.mjs"]
