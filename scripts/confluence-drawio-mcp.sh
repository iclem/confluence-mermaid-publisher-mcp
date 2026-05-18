#!/usr/bin/env bash

set -euo pipefail

IMAGE="${CONFLUENCE_MERMAID_PUBLISHER_MCP_IMAGE:-confluence-mermaid-publisher-mcp:local}"
WORKSPACE_ROOT="${CONFLUENCE_MERMAID_PUBLISHER_MCP_WORKSPACE:-${PWD}}"

if [[ -n "${COPILOT_MCP_CONFLUENCE_URL:-}" && -z "${CONFLUENCE_BASE_URL:-}" ]]; then
  export CONFLUENCE_BASE_URL="${COPILOT_MCP_CONFLUENCE_URL}"
fi

if [[ -n "${COPILOT_MCP_CONFLUENCE_USERNAME:-}" && -z "${CONFLUENCE_EMAIL:-}" ]]; then
  export CONFLUENCE_EMAIL="${COPILOT_MCP_CONFLUENCE_USERNAME}"
fi

if [[ -n "${COPILOT_MCP_CONFLUENCE_API_TOKEN:-}" && -z "${CONFLUENCE_API_TOKEN:-}" ]]; then
  export CONFLUENCE_API_TOKEN="${COPILOT_MCP_CONFLUENCE_API_TOKEN}"
fi

if [[ "${WORKSPACE_ROOT}" != /* ]]; then
  printf 'Workspace directory must be an absolute path: %s\n' "${WORKSPACE_ROOT}" >&2
  exit 1
fi

if [[ ! -d "${WORKSPACE_ROOT}" ]]; then
  printf 'Workspace directory not found: %s\n' "${WORKSPACE_ROOT}" >&2
  exit 1
fi

exec docker run --rm -i \
  -v "${WORKSPACE_ROOT}:${WORKSPACE_ROOT}" \
  -w "${WORKSPACE_ROOT}" \
  -e CONFLUENCE_BASE_URL \
  -e CONFLUENCE_EMAIL \
  -e CONFLUENCE_API_TOKEN \
  -e CONFLUENCE_BEARER_TOKEN \
  -e COPILOT_MCP_CONFLUENCE_URL \
  -e COPILOT_MCP_CONFLUENCE_USERNAME \
  -e COPILOT_MCP_CONFLUENCE_API_TOKEN \
  "${IMAGE}" mcp
