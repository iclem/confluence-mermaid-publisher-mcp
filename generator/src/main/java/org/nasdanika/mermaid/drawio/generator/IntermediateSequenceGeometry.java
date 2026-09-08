package org.nasdanika.mermaid.drawio.generator;

import java.util.List;
import java.util.Map;

public record IntermediateSequenceGeometry(
        List<Participant> participants,
        Map<String, Double> eventYs,
        List<Frame> frames,
        List<Note> notes,
        List<Activation> activations,
        List<SelfMessage> selfMessages) {

    public record Participant(
            String id,
            double x,
            double y,
            double width,
            double height,
            double lifelineX,
            double lifelineBottom) {
    }

    public record Frame(
            int startOrder,
            int depth,
            double x,
            double y,
            double width,
            double height,
            List<Double> dividerYs) {
    }

    public record Note(int order, double x, double y, double width, double height) {
    }

    public record Activation(
            String participantId,
            int startOrder,
            double x,
            double y,
            double width,
            double height) {
    }

    public record SelfMessage(int order, List<Point> points) {
    }

    public record Point(double x, double y) {
    }
}
