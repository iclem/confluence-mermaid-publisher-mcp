FROM maven:3.9.9-eclipse-temurin-21

ARG NODE_MAJOR=22

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV CONFLUENCE_MERMAID_PUBLISHER_MCP_HOME=/app
WORKDIR ${CONFLUENCE_MERMAID_PUBLISHER_MCP_HOME}

COPY . ${CONFLUENCE_MERMAID_PUBLISHER_MCP_HOME}

RUN npm --prefix parser ci \
    && npm --prefix parser run build \
    && npm --prefix publisher ci \
    && npm --prefix publisher run build \
    && mvn -q -f generator/pom.xml -DskipTests package \
    && chmod +x scripts/*.sh

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
EXPOSE 3000
CMD ["mcp"]
