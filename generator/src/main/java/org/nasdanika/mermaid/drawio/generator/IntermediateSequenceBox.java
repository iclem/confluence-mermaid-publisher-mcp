package org.nasdanika.mermaid.drawio.generator;

import java.util.List;

public record IntermediateSequenceBox(
        String label,
        String fillColor,
        List<String> participantIds) {
}
