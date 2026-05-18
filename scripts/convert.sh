#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARSER_DIR="${ROOT_DIR}/parser"
GENERATOR_DIR="${ROOT_DIR}/generator"
CALLER_DIR="$(pwd)"
MAVEN_REPO_LOCAL="${MAVEN_REPO_LOCAL:-}"
MAVEN_REPO_ARGS=()

if [[ -n "${MAVEN_REPO_LOCAL}" ]]; then
  MAVEN_REPO_ARGS+=("-Dmaven.repo.local=${MAVEN_REPO_LOCAL}")
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <input.mermaid> [output.drawio]" >&2
  exit 1
fi

INPUT_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
if [[ ! -f "${INPUT_FILE}" ]]; then
  echo "Input Mermaid file not found: ${INPUT_FILE}" >&2
  exit 1
fi

if [[ $# -eq 2 ]]; then
  if [[ "$2" = /* ]]; then
    OUTPUT_FILE="$2"
  else
    OUTPUT_FILE="${CALLER_DIR}/$2"
  fi
else
  OUTPUT_FILE="${INPUT_FILE%.*}.drawio"
fi

mkdir -p "$(dirname "${OUTPUT_FILE}")"

PAGE_NAME="$(basename "${INPUT_FILE}")"
PAGE_NAME="${PAGE_NAME%.*}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

"${ROOT_DIR}/scripts/ensure-node-platform-deps.sh" "${PARSER_DIR}"

if [[ ! -f "${PARSER_DIR}/dist/cli.js" ]]; then
  pushd "${PARSER_DIR}" >/dev/null
  npm run build
  popd >/dev/null
fi

if [[ ! -f "${GENERATOR_DIR}/target/confluence-mermaid-publisher-mcp-generator-0.1.0-SNAPSHOT.jar" ]]; then
  pushd "${GENERATOR_DIR}" >/dev/null
  mvn -q "${MAVEN_REPO_ARGS[@]}" -DskipTests package
  popd >/dev/null
fi

pushd "${PARSER_DIR}" >/dev/null
node dist/cli.js "${PAGE_NAME}" "${INPUT_FILE}" > "${TMP_DIR}/diagram.json"
popd >/dev/null

pushd "${GENERATOR_DIR}" >/dev/null
mvn -q "${MAVEN_REPO_ARGS[@]}" -Dexec.mainClass=org.nasdanika.mermaid.drawio.generator.GeneratorMain exec:java < "${TMP_DIR}/diagram.json" > "${OUTPUT_FILE}"
popd >/dev/null

echo "Wrote ${OUTPUT_FILE}"
