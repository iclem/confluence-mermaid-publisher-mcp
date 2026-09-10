package org.nasdanika.mermaid.drawio.generator;

import java.util.List;

public record IntermediateDiagram(
        String pageName,
        String diagramType,
        String direction,
        List<IntermediateNode> nodes,
        List<IntermediateEdge> edges,
        List<IntermediateSubgraph> subgraphs,
        List<IntermediateSequenceParticipant> sequenceParticipants,
        List<IntermediateSequenceMessage> sequenceMessages,
        List<IntermediateSequenceNote> sequenceNotes,
        List<IntermediateSequenceActivation> sequenceActivations,
        List<IntermediateSequenceFrame> sequenceFrames,
        List<IntermediateSequenceBox> sequenceBoxes,
        IntermediateSequenceGeometry sequenceGeometry,
        List<String> warnings) {

    public IntermediateDiagram(
            String pageName,
            String diagramType,
            String direction,
            List<IntermediateNode> nodes,
            List<IntermediateEdge> edges,
            List<IntermediateSubgraph> subgraphs,
            List<IntermediateSequenceParticipant> sequenceParticipants,
            List<IntermediateSequenceMessage> sequenceMessages,
            List<IntermediateSequenceNote> sequenceNotes,
            List<IntermediateSequenceActivation> sequenceActivations,
            List<IntermediateSequenceFrame> sequenceFrames,
            List<String> warnings) {
        this(
                pageName,
                diagramType,
                direction,
                nodes,
                edges,
                subgraphs,
                sequenceParticipants,
                sequenceMessages,
                sequenceNotes,
                sequenceActivations,
                sequenceFrames,
                null,
                null,
                warnings);
    }

    public IntermediateDiagram(
            String pageName,
            String diagramType,
            String direction,
            List<IntermediateNode> nodes,
            List<IntermediateEdge> edges,
            List<IntermediateSubgraph> subgraphs,
            List<IntermediateSequenceParticipant> sequenceParticipants,
            List<IntermediateSequenceMessage> sequenceMessages,
            List<IntermediateSequenceNote> sequenceNotes,
            List<IntermediateSequenceActivation> sequenceActivations,
            List<IntermediateSequenceFrame> sequenceFrames,
            List<IntermediateSequenceBox> sequenceBoxes,
            List<String> warnings) {
        this(
                pageName,
                diagramType,
                direction,
                nodes,
                edges,
                subgraphs,
                sequenceParticipants,
                sequenceMessages,
                sequenceNotes,
                sequenceActivations,
                sequenceFrames,
                sequenceBoxes,
                null,
                warnings);
    }
}
