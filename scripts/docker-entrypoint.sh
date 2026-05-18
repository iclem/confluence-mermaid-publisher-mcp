#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="${CONFLUENCE_MERMAID_PUBLISHER_MCP_HOME:-/app}"
COMMAND="${1:-mcp}"

case "${COMMAND}" in
  mcp)
    exec node "${ROOT_DIR}/publisher/dist/mcp-server.js"
    ;;
  mcp-http)
    shift
    exec node "${ROOT_DIR}/publisher/dist/mcp-http-server.js" "$@"
    ;;
  publisher-cli)
    shift
    exec node "${ROOT_DIR}/publisher/dist/cli.js" "$@"
    ;;
  convert)
    shift
    exec "${ROOT_DIR}/scripts/convert.sh" "$@"
    ;;
  test)
    shift
    exec "${ROOT_DIR}/scripts/test.sh" "$@"
    ;;
  shell|bash)
    shift
    exec bash "$@"
    ;;
  *)
    cat >&2 <<'EOF'
Usage: confluence-mermaid-publisher-mcp [mcp|mcp-http|publisher-cli|convert|test|shell] ...

Commands:
  mcp            Run the Confluence + draw.io MCP server (default).
  mcp-http       Run the Confluence + draw.io MCP server over Streamable HTTP.
  publisher-cli  Run the publisher CLI.
  convert        Convert Mermaid to .drawio using the packaged toolchain.
  test           Run the packaged test suite.
  shell          Open an interactive shell inside the container.
EOF
    exit 1
    ;;
esac
