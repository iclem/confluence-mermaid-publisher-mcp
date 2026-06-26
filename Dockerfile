FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV CONFLUENCE_MERMAID_PUBLISHER_MCP_HOME=/app
WORKDIR ${CONFLUENCE_MERMAID_PUBLISHER_MCP_HOME}

COPY . ${CONFLUENCE_MERMAID_PUBLISHER_MCP_HOME}

RUN npm --prefix publisher ci \
    && npm --prefix publisher run build \
    && chmod +x scripts/*.sh

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
EXPOSE 3000
CMD ["mcp"]
