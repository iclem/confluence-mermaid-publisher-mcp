#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE_ARGS=(-f "${ROOT_DIR}/build/docker-compose/docker-compose-local.yml")
DOCKER_ARGS=()
STAGE_DIR=""
CONTAINER_ROOT="/app"

cleanup() {
  if [[ -n "${STAGE_DIR}" && -d "${STAGE_DIR}" ]]; then
    rm -rf "${STAGE_DIR}"
  fi
}

trap cleanup EXIT

if [[ -n "${COPILOT_MCP_CONFLUENCE_URL:-}" && -z "${CONFLUENCE_BASE_URL:-}" ]]; then
  export CONFLUENCE_BASE_URL="${COPILOT_MCP_CONFLUENCE_URL}"
fi

if [[ -n "${COPILOT_MCP_CONFLUENCE_USERNAME:-}" && -z "${CONFLUENCE_EMAIL:-}" ]]; then
  export CONFLUENCE_EMAIL="${COPILOT_MCP_CONFLUENCE_USERNAME}"
fi

if [[ -n "${COPILOT_MCP_CONFLUENCE_API_TOKEN:-}" && -z "${CONFLUENCE_API_TOKEN:-}" ]]; then
  export CONFLUENCE_API_TOKEN="${COPILOT_MCP_CONFLUENCE_API_TOKEN}"
fi

stage_file_arg() {
  local option_name="$1"
  local host_path="$2"
  local resolved_path
  local staged_path
  local container_path

  if [[ -z "${STAGE_DIR}" ]]; then
    STAGE_DIR="$(mktemp -d "${ROOT_DIR}/.publish-stage.XXXXXX")"
  fi

  if [[ "${host_path}" = /* ]]; then
    resolved_path="${host_path}"
  else
    resolved_path="$(cd "$(dirname "${host_path}")" && pwd)/$(basename "${host_path}")"
  fi

  if [[ ! -f "${resolved_path}" ]]; then
    echo "Input file not found for --${option_name}: ${host_path}" >&2
    exit 1
  fi

  staged_path="${STAGE_DIR}/${option_name}-$(basename "${resolved_path}")"
  cp "${resolved_path}" "${staged_path}"
  container_path="${CONTAINER_ROOT}/$(basename "${STAGE_DIR}")/$(basename "${staged_path}")"
  DOCKER_ARGS+=("$(printf '%q' "${container_path}")")
}

ARGS=("$@")
INDEX=0

while (( INDEX < ${#ARGS[@]} )); do
  arg="${ARGS[INDEX]}"
  DOCKER_ARGS+=("$(printf '%q' "${arg}")")

  case "${arg}" in
    --markdown-file)
      INDEX=$((INDEX + 1))
      if (( INDEX >= ${#ARGS[@]} )); then
        echo "Missing value for ${arg}" >&2
        exit 1
      fi
      stage_file_arg "${arg#--}" "${ARGS[INDEX]}"
      ;;
    *)
      if (( INDEX + 1 < ${#ARGS[@]} )) && [[ "${ARGS[INDEX + 1]}" != --* ]]; then
        INDEX=$((INDEX + 1))
        DOCKER_ARGS+=("$(printf '%q' "${ARGS[INDEX]}")")
      fi
      ;;
  esac

  INDEX=$((INDEX + 1))
done

cd "${ROOT_DIR}"
docker compose "${COMPOSE_FILE_ARGS[@]}" run --rm dev bash -lc \
  "cd /app && node publisher/dist/cli.js ${DOCKER_ARGS[*]}"
