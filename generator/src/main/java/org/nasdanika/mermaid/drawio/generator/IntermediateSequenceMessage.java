package org.nasdanika.mermaid.drawio.generator;

public record IntermediateSequenceMessage(
        int order,
        String sourceId,
        String targetId,
        String label,
        String kind,
        Integer number) {

    public IntermediateSequenceMessage(int order, String sourceId, String targetId, String label, String kind) {
        this(order, sourceId, targetId, label, kind, null);
    }
}
