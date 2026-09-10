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
STATE_COMPOSITE_FIXTURE="${ROOT_DIR}/test-data/state-composite-edge.mermaid"
TARGET_ARCH_FIXTURE="${ROOT_DIR}/test-data/target-architecture-flowchart.mermaid"
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

"${ROOT_DIR}/scripts/convert.sh" "${STATE_COMPOSITE_FIXTURE}" "${TMP_DIR}/state-composite.drawio" >/dev/null
grep -q "Review" "${TMP_DIR}/state-composite.drawio"
grep -q "Screening" "${TMP_DIR}/state-composite.drawio"
grep -q "sign off" "${TMP_DIR}/state-composite.drawio"

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

"${ROOT_DIR}/scripts/convert.sh" "${TARGET_ARCH_FIXTURE}" "${TMP_DIR}/target-architecture.drawio" >/dev/null
# No edge terminal may sit farther than 60px from its endpoint node's bbox
# (dagre's padded routing box phantom segments must be trimmed).
python3 - "${TMP_DIR}/target-architecture.drawio" <<'PYEOF'
import math, re, sys
xml = open(sys.argv[1]).read()
nodes = {}
for m in re.finditer(r'<object id="([^"]+)" label="[^"]*">\s*<mxCell parent="([^"]+)"[^>]*vertex="1"[^>]*>\s*<mxGeometry[^>]*height="([\d.-]+)"[^>]*width="([\d.-]+)"[^>]*x="([\d.-]+)"[^>]*y="([\d.-]+)"', xml):
    nid, parent, h, w, x, y = m.groups()
    nodes[nid] = {"parent": parent, "x": float(x), "y": float(y), "w": float(w), "h": float(h)}
def abs_pos(nid):
    n = nodes[nid]; x, y, p = n["x"], n["y"], n["parent"]
    while p in nodes:
        x += nodes[p]["x"]; y += nodes[p]["y"]; p = nodes[p]["parent"]
    return x, y
def drect(pt, nid):
    x, y = abs_pos(nid); n = nodes[nid]
    return math.hypot(max(x - pt[0], 0, pt[0] - (x + n["w"])), max(y - pt[1], 0, pt[1] - (y + n["h"])))
worst, worst_edge = 0.0, None
for m in re.finditer(r'<mxCell edge="1"[^>]*source="([^"]+)"[^>]*style="([^"]*)"[^>]*target="([^"]+)"[^>]*>(.*?)</mxCell>', xml, re.S):
    src, style, tgt, body = m.groups()
    if src not in nodes or tgt not in nodes:
        continue
    ex = re.search(r'exitX=([\d.-]+);exitY=([\d.-]+)', style)
    en = re.search(r'entryX=([\d.-]+);entryY=([\d.-]+)', style)
    way = [(float(x), float(y)) for x, y in re.findall(r'<mxPoint x="([\d.-]+)" y="([\d.-]+)"/>', body)]
    pts = list(way)
    if ex:
        sx, sy = abs_pos(src); n = nodes[src]
        pts.insert(0, (sx + float(ex.group(1)) * n["w"], sy + float(ex.group(2)) * n["h"]))
    if en:
        tx, ty = abs_pos(tgt); n = nodes[tgt]
        pts.append((tx + float(en.group(1)) * n["w"], ty + float(en.group(2)) * n["h"]))
    if pts:
        d0, d1 = drect(pts[0], src), drect(pts[-1], tgt)
        if max(d0, d1) > worst:
            worst, worst_edge = max(d0, d1), f"{src}->{tgt}"
if worst > 60:
    raise SystemExit(f"edge {worst_edge} terminal is {worst:.0f}px from its endpoint bbox (phantom routing-box segment)")
PYEOF

"${ROOT_DIR}/scripts/convert.sh" "${XYCHART_TAXONOMY_FIXTURE}" "${TMP_DIR}/taxonomy-enrichment-total.drawio" >/dev/null
grep -q "Taxonomy Enrichment Total - 9,900 Nodes (USD)" "${TMP_DIR}/taxonomy-enrichment-total.drawio"
grep -q "xychart-bar-3-3" "${TMP_DIR}/taxonomy-enrichment-total.drawio"
grep -q "5 langs" "${TMP_DIR}/taxonomy-enrichment-total.drawio"

echo "End-to-end conversion passed"
