#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="${ROOT_DIR}/test-data/simple-flowchart.mermaid"
CHAIN_FIXTURE="${ROOT_DIR}/test-data/validation-flowchart.mermaid"
ARCHITECTURE_FIXTURE="${ROOT_DIR}/test-data/catalogue-publication-architecture.mermaid"
ROLLOUT_FIXTURE="${ROOT_DIR}/test-data/parity-rollout.mermaid"
SEQUENCE_FIXTURE="${ROOT_DIR}/test-data/catalogue-publication-sequence.mermaid"
SEQUENCE_ACTIVATION_FIXTURE="${ROOT_DIR}/test-data/sequence-activation-bars.mermaid"
SEQUENCE_FRAME_FIXTURE="${ROOT_DIR}/test-data/sequence-control-frames.mermaid"
SEQUENCE_ALT_FIXTURE="${ROOT_DIR}/test-data/sequence-alt-frames.mermaid"
SEQUENCE_BOX_FIXTURE="${ROOT_DIR}/test-data/sequence-boxes-autonumber.mermaid"
STATE_FIXTURE="${ROOT_DIR}/test-data/state-rollout.mermaid"
GANTT_FIXTURE="${ROOT_DIR}/test-data/delivery-plan-gantt.mermaid"
XYCHART_COST_FIXTURE="${ROOT_DIR}/test-data/cost-estimation-classify-embedding-p50.mermaid"
XYCHART_JUDGE_FIXTURE="${ROOT_DIR}/test-data/cost-estimation-judge-phase-impact-p50.mermaid"
XYCHART_SCALE_FIXTURE="${ROOT_DIR}/test-data/cost-estimation-scale-p50.mermaid"
XYCHART_TAXONOMY_FIXTURE="${ROOT_DIR}/test-data/taxonomy-enrichment-total.mermaid"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

"${ROOT_DIR}/scripts/convert.sh" "${FIXTURE}" "${TMP_DIR}/diagram.drawio" >/dev/null

grep -q "<mxfile" "${TMP_DIR}/diagram.drawio"
grep -q "Start" "${TMP_DIR}/diagram.drawio"
grep -q "Decision" "${TMP_DIR}/diagram.drawio"
grep -q "classic" "${TMP_DIR}/diagram.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${CHAIN_FIXTURE}" "${TMP_DIR}/validation-flowchart.drawio" >/dev/null
grep -q "Validate" "${TMP_DIR}/validation-flowchart.drawio"
grep -q "Publish" "${TMP_DIR}/validation-flowchart.drawio"
grep -q "Retry" "${TMP_DIR}/validation-flowchart.drawio"
grep -q "Review output" "${TMP_DIR}/validation-flowchart.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${ARCHITECTURE_FIXTURE}" "${TMP_DIR}/architecture.drawio" >/dev/null
grep -q "Product Write Path" "${TMP_DIR}/architecture.drawio"
grep -q "FeedProductPrepared" "${TMP_DIR}/architecture.drawio"
grep -q "Mirakl connector" "${TMP_DIR}/architecture.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${ROLLOUT_FIXTURE}" "${TMP_DIR}/rollout.drawio" >/dev/null
grep -q "Shadow mode live" "${TMP_DIR}/rollout.drawio"
grep -q "Gate D met" "${TMP_DIR}/rollout.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${SEQUENCE_FIXTURE}" "${TMP_DIR}/sequence.drawio" >/dev/null
grep -q "umlLifeline" "${TMP_DIR}/sequence.drawio"
grep -q "Backoffice / Internal" "${TMP_DIR}/sequence.drawio"
grep -q "Create or update product" "${TMP_DIR}/sequence.drawio"
grep -q "Legacy post_write HTTP call retired for API writes" "${TMP_DIR}/sequence.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${SEQUENCE_ACTIVATION_FIXTURE}" "${TMP_DIR}/sequence-activations.drawio" >/dev/null
grep -q "sequence-activation-B-0-0" "${TMP_DIR}/sequence-activations.drawio"
grep -q "Dispatch" "${TMP_DIR}/sequence-activations.drawio"
grep -q "Ack" "${TMP_DIR}/sequence-activations.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${SEQUENCE_FRAME_FIXTURE}" "${TMP_DIR}/sequence-frames.drawio" >/dev/null
grep -q "sequence-frame-opt-0-0" "${TMP_DIR}/sequence-frames.drawio"
grep -q "sequence-frame-loop-1-1" "${TMP_DIR}/sequence-frames.drawio"
grep -q "Retry until success" "${TMP_DIR}/sequence-frames.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${SEQUENCE_ALT_FIXTURE}" "${TMP_DIR}/sequence-alt.drawio" >/dev/null
grep -q "sequence-frame-alt-1-0" "${TMP_DIR}/sequence-alt.drawio"
grep -q "sequence-frame-alt-1-0-section-2" "${TMP_DIR}/sequence-alt.drawio"
grep -q "cache passthrough" "${TMP_DIR}/sequence-alt.drawio"
grep -q "umlFrame" "${TMP_DIR}/sequence-alt.drawio"
grep -q "dashPattern=3 3" "${TMP_DIR}/sequence-alt.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${SEQUENCE_BOX_FIXTURE}" "${TMP_DIR}/sequence-boxes.drawio" >/dev/null
grep -q "sequence-box-B" "${TMP_DIR}/sequence-boxes.drawio"
grep -q "umlActor" "${TMP_DIR}/sequence-boxes.drawio"
grep -q "sequence-number-0" "${TMP_DIR}/sequence-boxes.drawio"
grep -q "sequence-number-4" "${TMP_DIR}/sequence-boxes.drawio"
grep -q "endArrow=classic" "${TMP_DIR}/sequence-boxes.drawio"
grep -q "sequence-activation-B-1-0" "${TMP_DIR}/sequence-boxes.drawio"
grep -q "watched async" "${TMP_DIR}/sequence-boxes.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${STATE_FIXTURE}" "${TMP_DIR}/state-rollout.drawio" >/dev/null
grep -q "LegacyOnly" "${TMP_DIR}/state-rollout.drawio"
grep -q "EventDriven" "${TMP_DIR}/state-rollout.drawio"
grep -q "state-note-1" "${TMP_DIR}/state-rollout.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${GANTT_FIXTURE}" "${TMP_DIR}/delivery-plan-gantt.drawio" >/dev/null
grep -q "EDA Migration" "${TMP_DIR}/delivery-plan-gantt.drawio"
grep -q "gantt-task-bar-p1e1" "${TMP_DIR}/delivery-plan-gantt.drawio"
grep -q "2026-01" "${TMP_DIR}/delivery-plan-gantt.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${XYCHART_COST_FIXTURE}" "${TMP_DIR}/cost-estimation-classify-embedding-p50.drawio" >/dev/null
grep -q "Cost per 1,000 Products - Classify + Embedding, P50 (USD)" "${TMP_DIR}/cost-estimation-classify-embedding-p50.drawio"
grep -q "xychart-bar-0-3" "${TMP_DIR}/cost-estimation-classify-embedding-p50.drawio"
grep -q "Lite Batch" "${TMP_DIR}/cost-estimation-classify-embedding-p50.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${XYCHART_JUDGE_FIXTURE}" "${TMP_DIR}/cost-estimation-judge-phase-impact-p50.drawio" >/dev/null
grep -q "Judge Phase Impact - Flash, per 1,000 Products, P50 (USD)" "${TMP_DIR}/cost-estimation-judge-phase-impact-p50.drawio"
grep -q "xychart-bar-1-1" "${TMP_DIR}/cost-estimation-judge-phase-impact-p50.drawio"
grep -q "Batch (Flash)" "${TMP_DIR}/cost-estimation-judge-phase-impact-p50.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${XYCHART_SCALE_FIXTURE}" "${TMP_DIR}/cost-estimation-scale-p50.drawio" >/dev/null
grep -q "Cost at Scale - Classify + Embedding, P50 (USD)" "${TMP_DIR}/cost-estimation-scale-p50.drawio"
grep -q "xychart-line-point-3-2" "${TMP_DIR}/cost-estimation-scale-p50.drawio"
grep -q "100K" "${TMP_DIR}/cost-estimation-scale-p50.drawio"

"${ROOT_DIR}/scripts/convert.sh" "${XYCHART_TAXONOMY_FIXTURE}" "${TMP_DIR}/taxonomy-enrichment-total.drawio" >/dev/null
grep -q "Taxonomy Enrichment Total - 9,900 Nodes (USD)" "${TMP_DIR}/taxonomy-enrichment-total.drawio"
grep -q "xychart-bar-3-3" "${TMP_DIR}/taxonomy-enrichment-total.drawio"
grep -q "5 langs" "${TMP_DIR}/taxonomy-enrichment-total.drawio"

echo "End-to-end conversion passed"
