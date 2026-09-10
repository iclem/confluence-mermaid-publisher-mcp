package org.nasdanika.mermaid.drawio.generator;

public record IntermediateSequenceFrame(
        String kind,
        String label,
        int startOrder,
        int endOrder,
        int depth,
        java.util.List<String> participantIds,
        java.util.List<IntermediateSequenceFrameSection> sections) {

    public IntermediateSequenceFrame(String kind, String label, int startOrder, int endOrder, int depth) {
        this(kind, label, startOrder, endOrder, depth, null, null);
    }

    public IntermediateSequenceFrame(
            String kind,
            String label,
            int startOrder,
            int endOrder,
            int depth,
            java.util.List<String> participantIds) {
        this(kind, label, startOrder, endOrder, depth, participantIds, null);
    }
}
