package org.nasdanika.mermaid.drawio.generator;

public record IntermediateSequenceParticipant(
        String id,
        String label,
        String type) {

    public IntermediateSequenceParticipant(String id, String label) {
        this(id, label, null);
    }
}
