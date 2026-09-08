package org.nasdanika.mermaid.drawio.generator;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.TransformerException;

import org.nasdanika.drawio.Connection;
import org.nasdanika.drawio.ConnectionPoint;
import org.nasdanika.drawio.Document;
import org.nasdanika.drawio.Layer;
import org.nasdanika.drawio.Node;
import org.nasdanika.drawio.Page;
import org.nasdanika.drawio.Root;
import org.nasdanika.drawio.style.ConnectionStyle;
import org.nasdanika.drawio.style.NodeStyle;

public class DrawioGenerator {

    private static final int NODE_MIN_WIDTH = 140;
    private static final int NODE_MIN_HEIGHT = 60;
    private static final int PRIMARY_SPACING = 80;
    private static final int HORIZONTAL_LANE_SPACING = 60;
    private static final int VERTICAL_LANE_SPACING = 50;
    private static final int SUBGRAPH_PADDING_X = 30;
    private static final int SUBGRAPH_PADDING_BOTTOM = 30;
    private static final int SUBGRAPH_PADDING_TOP = 50;

    private static final int SEQUENCE_TOP = 20;
    private static final int SEQUENCE_LEFT = 20;
    private static final int SEQUENCE_HEADER_SIZE = 65;
    private static final int SEQUENCE_EVENT_START = 105;
    private static final int SEQUENCE_ROW_SPACING = 70;
    private static final int SEQUENCE_BOTTOM_PADDING = 80;
    private static final int SEQUENCE_PARTICIPANT_GAP = 100;
    private static final int SEQUENCE_MIN_PARTICIPANT_WIDTH = 150;
    private static final int SEQUENCE_MAX_PARTICIPANT_WIDTH = 320;
    private static final int SEQUENCE_SELF_LOOP_WIDTH = 50;
    private static final int SEQUENCE_SELF_LOOP_HEIGHT = 30;
    private static final int SEQUENCE_NOTE_HEIGHT = 50;
    private static final int SEQUENCE_NOTE_MARGIN = 20;
    private static final int SEQUENCE_ACTIVATION_WIDTH = 14;
    private static final int SEQUENCE_ACTIVATION_OFFSET = 10;
    private static final int SEQUENCE_ACTIVATION_TOP_OFFSET = 8;
    private static final int SEQUENCE_ACTIVATION_BOTTOM_OFFSET = 28;
    private static final int SEQUENCE_FRAME_MARGIN = 10;
    private static final int SEQUENCE_FRAME_DEPTH_OFFSET = 12;
    private static final int SEQUENCE_FRAME_LABEL_HEIGHT = 28;
    private static final int SEQUENCE_FRAME_TAB_HEIGHT = 20;
    private static final int SEQUENCE_FRAME_BOTTOM_OFFSET = 36;
    private static final int SEQUENCE_FRAME_INNER_VERTICAL_OFFSET = 22;

    private record Bounds(int x, int y, int width, int height) {
    }

    private record NodeDimensions(int width, int height) {
    }

    private record LayoutGrid(Map<String, Bounds> nodeBounds) {
    }

    private record SequenceFrame(Node node, int x, int width, int height, int centerX, int index) {
    }

    public String generate(IntermediateDiagram diagram) throws TransformerException, IOException {
        try {
            String diagramType = diagram.diagramType() == null ? "flowchart" : diagram.diagramType();
            if ("sequence".equals(diagramType)) {
                return generateSequence(diagram);
            }
            return generateFlowchart(diagram);
        } catch (Exception e) {
            if (e instanceof TransformerException transformerException) {
                throw transformerException;
            }
            if (e instanceof IOException ioException) {
                throw ioException;
            }
            throw new IllegalStateException("Failed to generate drawio output", e);
        }
    }

    private String generateFlowchart(IntermediateDiagram diagram)
            throws TransformerException, IOException, ParserConfigurationException {
        Document document = Document.create(false, null);
        Page page = document.createPage();
        page.setName(diagram.pageName() == null || diagram.pageName().isBlank() ? "Mermaid Diagram" : diagram.pageName());

        Root root = page.getModel().getRoot();
        Layer<?> layer = root.getLayers().get(0);

        List<IntermediateNode> nodes = diagram.nodes() == null ? List.of() : diagram.nodes();
        Map<String, Integer> orderById = new HashMap<>();
        for (int i = 0; i < nodes.size(); i++) {
            orderById.put(nodes.get(i).id(), i);
        }
        LayoutGrid layoutGrid = usesExplicitLayout(nodes)
                ? new LayoutGrid(computeExplicitNodeBounds(nodes))
                : computeLayoutGrid(diagram, nodes, orderById);
        Map<String, IntermediateSubgraph> subgraphById = new LinkedHashMap<>();
        for (IntermediateSubgraph subgraph : diagram.subgraphs() == null ? List.<IntermediateSubgraph>of() : diagram.subgraphs()) {
            subgraphById.put(subgraph.id(), subgraph);
        }
        Map<String, Bounds> subgraphBounds = computeSubgraphBounds(subgraphById, layoutGrid);
        Map<String, String> nodeToSubgraphId = mapNodeToSubgraph(subgraphById);

        Map<String, Node> nodeMap = new LinkedHashMap<>();
        Map<String, Node> subgraphNodeMap = new LinkedHashMap<>();
        for (IntermediateSubgraph subgraph : sortSubgraphsForCreation(subgraphById)) {
            Bounds bounds = subgraphBounds.get(subgraph.id());
            if (bounds == null) {
                continue;
            }
            Node container = createSubgraphContainer(
                    subgraph,
                    bounds,
                    subgraph.parentId() == null ? layer : subgraphNodeMap.get(subgraph.parentId()),
                    subgraphBounds);
            subgraphNodeMap.put(subgraph.id(), container);
        }

        for (IntermediateNode intermediateNode : nodes) {
            String subgraphId = nodeToSubgraphId.get(intermediateNode.id());
            Node node = subgraphId == null ? layer.createNode() : subgraphNodeMap.get(subgraphId).createNode();
            node.setLabel(formatLabel(intermediateNode.label()));
            node.setProperty("id", intermediateNode.id());
            applyNodeStyle(node, intermediateNode);
            applyLayout(
                    node,
                    layoutGrid.nodeBounds().get(intermediateNode.id()),
                    subgraphId == null ? null : subgraphBounds.get(subgraphId));
            nodeMap.put(intermediateNode.id(), node);
        }

        for (IntermediateEdge edge : diagram.edges() == null ? List.<IntermediateEdge>of() : diagram.edges()) {
            Node source = nodeMap.get(edge.sourceId());
            Node target = nodeMap.get(edge.targetId());
            if (source == null || target == null) {
                throw new IllegalArgumentException("Unknown edge endpoint: " + edge);
            }

            Connection connection = layer.createConnection(source, target);
            if (edge.label() != null && !edge.label().isBlank()) {
                connection.setLabel(edge.label());
            }
            applyFlowchartEdgeRoute(connection, edge);
            applyConnectionStyle(connection, edge.kind(), edge.points() != null && !edge.points().isEmpty());
        }

        return document.save(false);
    }

    private String generateSequence(IntermediateDiagram diagram)
            throws TransformerException, IOException, ParserConfigurationException {
        Document document = Document.create(false, null);
        Page page = document.createPage();
        page.setName(diagram.pageName() == null || diagram.pageName().isBlank() ? "Mermaid Diagram" : diagram.pageName());

        Root root = page.getModel().getRoot();
        Layer<?> layer = root.getLayers().get(0);

        List<IntermediateSequenceParticipant> participants =
                diagram.sequenceParticipants() == null ? List.of() : diagram.sequenceParticipants();
        List<IntermediateSequenceMessage> messages =
                diagram.sequenceMessages() == null ? List.of() : diagram.sequenceMessages();
        List<IntermediateSequenceNote> notes =
                diagram.sequenceNotes() == null ? List.of() : diagram.sequenceNotes();
        List<IntermediateSequenceActivation> activations =
                diagram.sequenceActivations() == null ? List.of() : diagram.sequenceActivations();
        List<IntermediateSequenceFrame> frames =
                diagram.sequenceFrames() == null ? List.of() : diagram.sequenceFrames();

        int maxOrder = -1;
        for (IntermediateSequenceMessage message : messages) {
            maxOrder = Math.max(maxOrder, message.order());
        }
        for (IntermediateSequenceNote note : notes) {
            maxOrder = Math.max(maxOrder, note.order());
        }
        for (IntermediateSequenceActivation activation : activations) {
            maxOrder = Math.max(maxOrder, activation.endOrder());
        }
        for (IntermediateSequenceFrame frame : frames) {
            maxOrder = Math.max(maxOrder, frame.endOrder());
        }
        int participantHeight =
                SEQUENCE_EVENT_START + Math.max(1, maxOrder + 1) * SEQUENCE_ROW_SPACING + SEQUENCE_BOTTOM_PADDING;

        Map<String, SequenceFrame> participantFrames = createSequenceParticipants(layer, participants, participantHeight);
        for (IntermediateSequenceFrame frame : frames) {
            createSequenceFrame(layer, frame, participantFrames);
        }
        for (IntermediateSequenceActivation activation : activations) {
            createSequenceActivation(activation, participantFrames);
        }
        for (IntermediateSequenceNote note : notes) {
            createSequenceNote(layer, note, participantFrames, participantHeight);
        }
        for (IntermediateSequenceMessage message : messages) {
            createSequenceMessage(layer, message, participantFrames, participantHeight);
        }

        return document.save(false);
    }

    private Map<String, SequenceFrame> createSequenceParticipants(
            Layer<?> layer,
            List<IntermediateSequenceParticipant> participants,
            int participantHeight) {
        Map<String, SequenceFrame> frames = new LinkedHashMap<>();
        int currentX = SEQUENCE_LEFT;
        for (int i = 0; i < participants.size(); i++) {
            IntermediateSequenceParticipant participant = participants.get(i);
            boolean isActor = "actor".equals(participant.type());
            int width = isActor ? 35 : computeParticipantWidth(participant.label());
            Node lifeline = layer.createNode();
            lifeline.setProperty("id", participant.id());
            lifeline.setLabel(formatLabel(participant.label()));

            NodeStyle style = lifeline.getStyle();
            style.shape("umlLifeline");
            style.container(true);
            style.collapsible(false);
            lifeline.style("perimeter", "lifelinePerimeter");
            lifeline.style("dropTarget", "0");
            lifeline.style("recursiveResize", "0");
            lifeline.style("outlineConnect", "0");
            lifeline.style("portConstraint", "eastwest");
            lifeline.style("whiteSpace", "wrap");
            lifeline.style("size", Integer.toString(SEQUENCE_HEADER_SIZE));
            lifeline.style(
                    "newEdgeStyle",
                    "{\"edgeStyle\":\"elbowEdgeStyle\",\"elbow\":\"vertical\",\"curved\":0,\"rounded\":0}");
            if (isActor) {
                lifeline.style("participant", "umlActor");
                lifeline.style("verticalAlign", "bottom");
                lifeline.style("labelPosition", "center");
                lifeline.style("verticalLabelPosition", "top");
                lifeline.style("align", "center");
            }

            lifeline.getGeometry().setBounds(currentX, SEQUENCE_TOP, width, participantHeight);
            frames.put(
                    participant.id(),
                    new SequenceFrame(
                            lifeline,
                            currentX,
                            width,
                            participantHeight,
                            currentX + width / 2,
                            i));
            currentX += width + SEQUENCE_PARTICIPANT_GAP;
        }

        return frames;
    }

    private void createSequenceFrame(
            Layer<?> layer,
            IntermediateSequenceFrame frame,
            Map<String, SequenceFrame> participantFrames) {
        if (participantFrames.isEmpty()) {
            return;
        }

        List<SequenceFrame> scopedParticipantFrames = frame.participantIds() == null || frame.participantIds().isEmpty()
                ? List.copyOf(participantFrames.values())
                : frame.participantIds().stream()
                        .map(participantFrames::get)
                        .filter(Objects::nonNull)
                        .toList();
        if (scopedParticipantFrames.isEmpty()) {
            scopedParticipantFrames = List.copyOf(participantFrames.values());
        }

        int minX = scopedParticipantFrames.stream().mapToInt(SequenceFrame::x).min().orElse(SEQUENCE_LEFT);
        int maxX = scopedParticipantFrames.stream()
                .mapToInt(participant -> participant.x() + participant.width())
                .max()
                .orElse(minX + SEQUENCE_MIN_PARTICIPANT_WIDTH);

        int depthOffset = frame.depth() * SEQUENCE_FRAME_DEPTH_OFFSET;
        int verticalInset = frame.depth() * SEQUENCE_FRAME_INNER_VERTICAL_OFFSET;
        int contentTop = computeSequenceEventY(frame.startOrder());
        int contentBottom = computeSequenceEventY(frame.endOrder() + 1);
        int x = minX - SEQUENCE_FRAME_MARGIN + depthOffset;
        int y = contentTop - SEQUENCE_FRAME_LABEL_HEIGHT + verticalInset;
        int width = Math.max(
                120,
                (maxX - minX) + 2 * SEQUENCE_FRAME_MARGIN - depthOffset * 2);
        int height = Math.max(
                48,
                contentBottom - contentTop
                        + SEQUENCE_FRAME_BOTTOM_OFFSET - verticalInset * 2);

        Node frameNode = layer.createNode();
        String frameId = "sequence-frame-" + frame.kind() + "-" + frame.startOrder() + "-" + frame.depth();
        frameNode.setProperty("id", frameId);
        frameNode.setLabel(formatLabel(frame.kind()));
        NodeStyle style = frameNode.getStyle();
        style.shape("umlFrame");
        frameNode.style("dashed", "1");
        frameNode.style("pointerEvents", "0");
        frameNode.style("dropTarget", "0");
        frameNode.style("strokeColor", "#B3B3B3");
        int tabWidth = frame.kind().length() * 10;
        frameNode.style("width", Integer.toString(tabWidth));
        frameNode.style("height", Integer.toString(SEQUENCE_FRAME_TAB_HEIGHT));
        frameNode.getGeometry().setBounds(x, y, width, height);

        Node title = frameNode.createNode();
        title.setProperty("id", frameId + "-title");
        title.setLabel(formatLabel(frame.label()));
        NodeStyle titleStyle = title.getStyle();
        titleStyle.shape("text");
        titleStyle.backgroundColor("none");
        titleStyle.color("none");
        titleStyle.align("center");
        titleStyle.verticalAlign("middle");
        title.style("whiteSpace", "wrap");
        title.getGeometry().setBounds(tabWidth, 0, width - tabWidth, SEQUENCE_FRAME_TAB_HEIGHT);

        if (frame.sections() != null) {
            for (IntermediateSequenceFrameSection section : frame.sections()) {
                Node divider = frameNode.createNode();
                divider.setProperty("id", frameId + "-section-" + section.order());
                divider.setLabel(formatLabel(section.label()));
                divider.style("shape", "line");
                divider.style("dashed", "1");
                divider.style("whiteSpace", "wrap");
                divider.style("verticalAlign", "top");
                divider.style("labelPosition", "center");
                divider.style("verticalLabelPosition", "middle");
                divider.style("align", "center");
                divider.style("strokeColor", "#B3B3B3");
                int dividerY = computeSequenceEventY(section.order()) - SEQUENCE_ROW_SPACING / 2 - y;
                divider.getGeometry().setBounds(0, dividerY, width, SEQUENCE_FRAME_TAB_HEIGHT);
            }
        }
    }

    private void createSequenceActivation(
            IntermediateSequenceActivation activation,
            Map<String, SequenceFrame> participantFrames) {
        SequenceFrame frame = participantFrames.get(activation.participantId());
        if (frame == null) {
            throw new IllegalArgumentException("Unknown sequence participant in activation: " + activation);
        }

        Node activationNode = frame.node().createNode();
        activationNode.setProperty(
                "id",
                "sequence-activation-" + activation.participantId() + "-" + activation.startOrder() + "-" + activation.depth());
        NodeStyle style = activationNode.getStyle();
        style.shape("rectangle");
        activationNode.style("points", "[]");
        activationNode.style("perimeter", "orthogonalPerimeter");
        activationNode.style("outlineConnect", "0");
        activationNode.style("targetShapes", "umlLifeline");
        activationNode.style("portConstraint", "eastwest");
        activationNode.style(
                "newEdgeStyle",
                "{\"edgeStyle\":\"elbowEdgeStyle\",\"elbow\":\"vertical\",\"curved\":0,\"rounded\":0}");

        int x = (frame.width() - SEQUENCE_ACTIVATION_WIDTH) / 2 + activation.depth() * SEQUENCE_ACTIVATION_OFFSET;
        int y = computeSequenceEventY(activation.startOrder()) - SEQUENCE_TOP + SEQUENCE_ACTIVATION_TOP_OFFSET;
        int height = Math.max(
                28,
                computeSequenceEventY(activation.endOrder()) - computeSequenceEventY(activation.startOrder())
                        + SEQUENCE_ACTIVATION_BOTTOM_OFFSET);
        activationNode.getGeometry().setBounds(x, y, SEQUENCE_ACTIVATION_WIDTH, height);
    }

    private void createSequenceNote(
            Layer<?> layer,
            IntermediateSequenceNote note,
            Map<String, SequenceFrame> participantFrames,
            int participantHeight) {
        if (note.participantIds() == null || note.participantIds().isEmpty()) {
            return;
        }

        List<SequenceFrame> frames = note.participantIds().stream()
                .map(participantFrames::get)
                .filter(frame -> frame != null)
                .toList();
        if (frames.isEmpty()) {
            return;
        }

        int minX = frames.stream().mapToInt(SequenceFrame::x).min().orElse(SEQUENCE_LEFT);
        int maxX = frames.stream().mapToInt(frame -> frame.x() + frame.width()).max().orElse(minX);
        int noteY = computeSequenceEventY(note.order());
        int noteX = minX - SEQUENCE_NOTE_MARGIN;
        int noteWidth = (maxX - minX) + 2 * SEQUENCE_NOTE_MARGIN;

        Node noteNode = layer.createNode();
        noteNode.setProperty("id", "sequence-note-" + note.order());
        noteNode.setLabel(formatLabel(note.label()));
        NodeStyle noteStyle = noteNode.getStyle();
        noteStyle.shape("rectangle");
        noteStyle.backgroundColor("#ffff88");
        noteStyle.color("#9E916F");
        noteStyle.align("center");
        noteStyle.verticalAlign("middle");
        noteNode.style("whiteSpace", "wrap");
        noteNode.getGeometry().setBounds(noteX, noteY - SEQUENCE_NOTE_HEIGHT / 2, noteWidth, SEQUENCE_NOTE_HEIGHT);
    }

    private void createSequenceMessage(
            Layer<?> layer,
            IntermediateSequenceMessage message,
            Map<String, SequenceFrame> participantFrames,
            int participantHeight) {
        SequenceFrame sourceFrame = participantFrames.get(message.sourceId());
        SequenceFrame targetFrame = participantFrames.get(message.targetId());
        if (sourceFrame == null || targetFrame == null) {
            throw new IllegalArgumentException("Unknown sequence participant in message: " + message);
        }

        int absoluteY = computeSequenceEventY(message.order());
        if (sourceFrame.index() == targetFrame.index()) {
            createSelfSequenceMessage(layer, sourceFrame, message, absoluteY, participantHeight);
            return;
        }

        boolean leftToRight = sourceFrame.centerX() < targetFrame.centerX();
        ConnectionPoint sourcePoint = sourceFrame.node().createConnectionPoint(leftToRight ? 1.0 : 0.0, toRelativeY(absoluteY, participantHeight));
        ConnectionPoint targetPoint = targetFrame.node().createConnectionPoint(leftToRight ? 0.0 : 1.0, toRelativeY(absoluteY, participantHeight));
        Connection connection = layer.createConnection(sourcePoint, targetPoint);
        connection.setLabel(message.label());
        configureSequenceMessageStyle(connection, message.kind());
        connection.getPoints().add((sourceFrame.centerX() + targetFrame.centerX()) / 2.0, absoluteY);
    }

    private void createSelfSequenceMessage(
            Layer<?> layer,
            SequenceFrame frame,
            IntermediateSequenceMessage message,
            int absoluteY,
            int participantHeight) {
        ConnectionPoint sourcePoint = frame.node().createConnectionPoint(1.0, toRelativeY(absoluteY, participantHeight));
        ConnectionPoint targetPoint =
                frame.node().createConnectionPoint(1.0, toRelativeY(absoluteY + SEQUENCE_SELF_LOOP_HEIGHT, participantHeight));
        Connection connection = layer.createConnection(sourcePoint, targetPoint);
        connection.setLabel(message.label());
        configureSequenceMessageStyle(connection, message.kind());
        connection.getStyle().put("curved", "1");
        connection.getPoints().add(frame.x() + frame.width() + SEQUENCE_SELF_LOOP_WIDTH, absoluteY);
        connection.getPoints().add(
                frame.x() + frame.width() + SEQUENCE_SELF_LOOP_WIDTH,
                absoluteY + SEQUENCE_SELF_LOOP_HEIGHT);
    }

    private void configureSequenceMessageStyle(Connection connection, String kind) {
        ConnectionStyle style = connection.getStyle();
        style.edgeStyle("elbowEdgeStyle");
        style.rounded(false);
        connection.style("verticalAlign", "bottom");
        connection.style("elbow", "vertical");
        connection.style("curved", "0");

        boolean dotted = false;
        boolean bidirectional = false;
        String endArrow = "block";
        switch (kind == null ? "solid" : kind) {
            case "dashed": // legacy alias for dotted
            case "dotted":
                dotted = true;
                break;
            case "solid-open":
                endArrow = "none";
                break;
            case "dotted-open":
                dotted = true;
                endArrow = "none";
                break;
            case "solid-cross":
                endArrow = "cross";
                break;
            case "dotted-cross":
                dotted = true;
                endArrow = "cross";
                break;
            case "solid-point":
                endArrow = "classic";
                break;
            case "dotted-point":
                dotted = true;
                endArrow = "classic";
                break;
            case "bidirectional-solid":
                bidirectional = true;
                break;
            case "bidirectional-dotted":
                dotted = true;
                bidirectional = true;
                break;
            default:
                break;
        }

        style.dashed(dotted ? "1" : "0");
        if (dotted) {
            connection.style("dashPattern", "2 3");
        }
        style.endArrow(endArrow);
        if ("classic".equals(endArrow)) {
            connection.style("endSize", "10");
        }
        if (bidirectional) {
            connection.style("startArrow", "block");
        }
    }

    private int computeParticipantWidth(String label) {
        int longestLineLength = label == null
                ? 0
                : label.lines().mapToInt(String::length).max().orElse(0);
        return Math.max(
                SEQUENCE_MIN_PARTICIPANT_WIDTH,
                Math.min(SEQUENCE_MAX_PARTICIPANT_WIDTH, longestLineLength * 8 + 40));
    }

    private int computeSequenceEventY(int order) {
        return SEQUENCE_TOP + SEQUENCE_EVENT_START + order * SEQUENCE_ROW_SPACING;
    }

    private double toRelativeY(int absoluteY, int participantHeight) {
        return (double) (absoluteY - SEQUENCE_TOP) / participantHeight;
    }

    private void applyNodeStyle(Node node, IntermediateNode intermediateNode) {
        NodeStyle style = node.getStyle();
        String shape = intermediateNode.shape();
        style.rounded(false);
        style.shape("rectangle");
        style.fontSize("14");
        style.verticalAlign("middle");
        style.align("center");
        node.style("whiteSpace", "wrap");
        node.style("html", "1");
        style.backgroundColor("#dae8fc");
        style.color("#6c8ebf");
        style.fontColor("#1f1f1f");

        if ("text".equals(shape)) {
            style.shape("text");
            style.backgroundColor("none");
            style.color("none");
        } else if ("rounded-rectangle".equals(shape)) {
            style.shape("rectangle");
            style.rounded(true);
            style.backgroundColor("#d5e8d4");
            style.color("#82b366");
        } else if ("rhombus".equals(shape)) {
            style.shape("rhombus");
            style.backgroundColor("#fff2cc");
            style.color("#d6b656");
        } else if ("ellipse".equals(shape)) {
            style.shape("ellipse");
            style.backgroundColor("#f8cecc");
            style.color("#b85450");
        }

        if (intermediateNode.fillColor() != null && !intermediateNode.fillColor().isBlank()) {
            style.backgroundColor(intermediateNode.fillColor());
        }
        if (intermediateNode.strokeColor() != null && !intermediateNode.strokeColor().isBlank()) {
            style.color(intermediateNode.strokeColor());
        }
        if (intermediateNode.fontColor() != null && !intermediateNode.fontColor().isBlank()) {
            style.fontColor(intermediateNode.fontColor());
        }
    }

    private String formatLabel(String label) {
        if (label == null) {
            return null;
        }
        return label
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\r\n", "\n")
                .replace("\r", "\n")
                .replace("\n", "<br/>");
    }

    private void applyFlowchartEdgeRoute(Connection connection, IntermediateEdge edge) {
        if (edge.points() == null || edge.points().isEmpty()) {
            return;
        }

        List<IntermediatePoint> points = edge.points().stream()
                .filter(point -> point != null && point.x() != null && point.y() != null)
                .toList();
        if (points.isEmpty()) {
            return;
        }

        if (points.size() == 1) {
            connection.getPoints().add(points.get(0).x(), points.get(0).y());
            return;
        }

        IntermediatePoint sourcePoint = points.get(0);
        IntermediatePoint targetPoint = points.get(points.size() - 1);
        connection.setSourcePoint(sourcePoint.x(), sourcePoint.y());
        connection.setTargetPoint(targetPoint.x(), targetPoint.y());
        for (int i = 1; i < points.size() - 1; i++) {
            IntermediatePoint point = points.get(i);
            connection.getPoints().add(point.x(), point.y());
        }
    }

    private void applyConnectionStyle(Connection connection, String kind, boolean hasExplicitRoute) {
        ConnectionStyle style = connection.getStyle();
        if (hasExplicitRoute) {
            style.remove("edgeStyle");
            style.rounded(false);
        } else {
            style.edgeStyle("orthogonalEdgeStyle").rounded(true);
        }
        style.color("#666666");
        if ("plain".equals(kind)) {
            style.endArrow("none");
        } else {
            style.endArrow("classic");
            style.endFill(true);
        }
        style.dashed("dashed-directed".equals(kind) ? "1" : "0");
    }

    private Node createSubgraphContainer(
            IntermediateSubgraph subgraph,
            Bounds bounds,
            Layer<?> parentLayer,
            Map<String, Bounds> subgraphBounds) {
        Node container = parentLayer.createNode();
        container.setProperty("id", subgraph.id());
        container.setLabel(formatLabel(subgraph.label()));
        NodeStyle style = container.getStyle();
        style.shape("swimlane");
        style.container(true);
        style.collapsible(false);
        style.fontSize("14");
        style.fontColor("#333333");
        style.backgroundColor("#f7f7f7");
        style.color("#c7c7c7");
        container.style("whiteSpace", "wrap");
        container.style("html", "1");

        Bounds parentBounds = subgraph.parentId() == null ? null : subgraphBounds.get(subgraph.parentId());
        int x = parentBounds == null ? bounds.x : bounds.x - parentBounds.x;
        int y = parentBounds == null ? bounds.y : bounds.y - parentBounds.y;
        container.getGeometry().setBounds(x, y, bounds.width, bounds.height);
        return container;
    }

    private void applyLayout(Node node, Bounds absoluteBounds, Bounds parentBounds) {
        if (absoluteBounds == null) {
            throw new IllegalArgumentException("Missing layout bounds for node " + node.getProperty("id"));
        }
        int x = parentBounds == null ? absoluteBounds.x : absoluteBounds.x - parentBounds.x;
        int y = parentBounds == null ? absoluteBounds.y : absoluteBounds.y - parentBounds.y;
        node.getGeometry().setBounds(x, y, absoluteBounds.width, absoluteBounds.height);
    }

    private LayoutGrid computeLayoutGrid(
            IntermediateDiagram diagram,
            List<IntermediateNode> nodes,
            Map<String, Integer> orderById) {

        Map<String, List<String>> outgoing = new HashMap<>();
        Map<String, List<String>> incoming = new HashMap<>();
        Map<String, Integer> indegree = new HashMap<>();
        for (IntermediateNode node : nodes) {
            outgoing.put(node.id(), new ArrayList<>());
            incoming.put(node.id(), new ArrayList<>());
            indegree.put(node.id(), 0);
        }

        for (IntermediateEdge edge : diagram.edges() == null ? List.<IntermediateEdge>of() : diagram.edges()) {
            outgoing.computeIfAbsent(edge.sourceId(), key -> new ArrayList<>()).add(edge.targetId());
            incoming.computeIfAbsent(edge.targetId(), key -> new ArrayList<>()).add(edge.sourceId());
            indegree.computeIfPresent(edge.targetId(), (key, value) -> value + 1);
        }

        ArrayDeque<String> queue = new ArrayDeque<>();
        nodes.stream()
                .map(IntermediateNode::id)
                .filter(id -> indegree.getOrDefault(id, 0) == 0)
                .sorted(Comparator.comparingInt(orderById::get))
                .forEach(queue::add);

        Map<String, Integer> levelById = new HashMap<>();
        Set<String> visited = new HashSet<>();
        while (!queue.isEmpty()) {
            String current = queue.removeFirst();
            visited.add(current);
            int currentLevel = levelById.getOrDefault(current, 0);
            for (String targetId : outgoing.getOrDefault(current, List.of())) {
                levelById.put(targetId, Math.max(levelById.getOrDefault(targetId, 0), currentLevel + 1));
                int nextInDegree = indegree.computeIfPresent(targetId, (key, value) -> value - 1);
                if (nextInDegree == 0) {
                    queue.addLast(targetId);
                }
            }
        }

        for (IntermediateNode node : nodes) {
            if (!visited.contains(node.id())) {
                levelById.putIfAbsent(node.id(), 0);
            }
        }

        Map<String, NodeDimensions> nodeDimensions = computeNodeDimensions(nodes);
        boolean horizontal = "LR".equals(diagram.direction()) || "RL".equals(diagram.direction());
        int maxLevel = levelById.values().stream().mapToInt(Integer::intValue).max().orElse(0);

        Map<Integer, List<String>> orderedNodeIdsByLevel = new HashMap<>();
        nodes.stream()
                .sorted(Comparator.comparingInt(node -> orderById.get(node.id())))
                .forEach(node -> orderedNodeIdsByLevel
                        .computeIfAbsent(levelById.getOrDefault(node.id(), 0), key -> new ArrayList<>())
                        .add(node.id()));

        for (int i = 0; i < 4; i++) {
            reorderLevels(orderedNodeIdsByLevel, incoming, orderById);
            reorderLevelsDescending(orderedNodeIdsByLevel, outgoing, orderById);
        }

        Map<Integer, Integer> primarySizes = new HashMap<>();
        for (Map.Entry<Integer, List<String>> entry : orderedNodeIdsByLevel.entrySet()) {
            int level = entry.getKey();
            int size = 0;
            for (String nodeId : entry.getValue()) {
                NodeDimensions dimensions = nodeDimensions.get(nodeId);
                if (dimensions == null) {
                    continue;
                }
                size = Math.max(size, horizontal ? dimensions.width() : dimensions.height());
            }
            primarySizes.put(level, size);
        }

        Map<Integer, Integer> primaryOffsets = new HashMap<>();
        int offset = 40;
        for (int displayLevel = 0; displayLevel <= maxLevel; displayLevel++) {
            int logicalLevel = displayToLogicalLevel(diagram.direction(), displayLevel, maxLevel);
            primaryOffsets.put(logicalLevel, offset);
            offset += primarySizes.getOrDefault(logicalLevel, horizontal ? NODE_MIN_WIDTH : NODE_MIN_HEIGHT) + PRIMARY_SPACING;
        }

        Map<String, Double> secondaryCenters = new HashMap<>();
        Map<String, Bounds> nodeBounds = new HashMap<>();
        int secondarySpacing = horizontal ? VERTICAL_LANE_SPACING : HORIZONTAL_LANE_SPACING;
        for (int level = 0; level <= maxLevel; level++) {
            List<String> levelNodeIds = orderedNodeIdsByLevel.getOrDefault(level, List.of());
            if (levelNodeIds.isEmpty()) {
                continue;
            }

            int primarySize = primarySizes.getOrDefault(level, horizontal ? NODE_MIN_WIDTH : NODE_MIN_HEIGHT);
            List<Double> desiredCenters = new ArrayList<>();
            List<Double> assignedCenters = new ArrayList<>();
            double nextCenter = -1;
            for (String nodeId : levelNodeIds) {
                NodeDimensions dimensions = nodeDimensions.get(nodeId);
                if (dimensions == null) {
                    continue;
                }
                double halfSecondary = (horizontal ? dimensions.height() : dimensions.width()) / 2.0;
                Double desiredCenter = computeDesiredSecondaryCenter(nodeId, incoming, secondaryCenters);
                if (desiredCenter == null) {
                    desiredCenter = nextCenter < 0 ? 40 + halfSecondary : nextCenter + halfSecondary + secondarySpacing;
                }
                double center = desiredCenter;
                if (nextCenter >= 0) {
                    center = Math.max(center, nextCenter + halfSecondary + secondarySpacing);
                } else {
                    center = Math.max(center, 40 + halfSecondary);
                }
                desiredCenters.add(desiredCenter);
                assignedCenters.add(center);
                nextCenter = center + halfSecondary;
            }

            if (!assignedCenters.isEmpty()) {
                double desiredMean = desiredCenters.stream().mapToDouble(Double::doubleValue).average().orElse(assignedCenters.get(0));
                double assignedMean = assignedCenters.stream().mapToDouble(Double::doubleValue).average().orElse(desiredMean);
                double shift = desiredMean - assignedMean;
                double minStart = Double.MAX_VALUE;
                for (int index = 0; index < levelNodeIds.size(); index++) {
                    String nodeId = levelNodeIds.get(index);
                    NodeDimensions dimensions = nodeDimensions.get(nodeId);
                    if (dimensions == null) {
                        continue;
                    }
                    double halfSecondary = (horizontal ? dimensions.height() : dimensions.width()) / 2.0;
                    minStart = Math.min(minStart, assignedCenters.get(index) - halfSecondary);
                }
                if (minStart != Double.MAX_VALUE) {
                    shift = Math.max(shift, 40 - minStart);
                    for (int index = 0; index < assignedCenters.size(); index++) {
                        assignedCenters.set(index, assignedCenters.get(index) + shift);
                    }
                }
            }

            for (int index = 0; index < levelNodeIds.size(); index++) {
                String nodeId = levelNodeIds.get(index);
                NodeDimensions dimensions = nodeDimensions.get(nodeId);
                if (dimensions == null) {
                    continue;
                }
                double center = assignedCenters.get(index);
                secondaryCenters.put(nodeId, center);
                int primaryOffset = primaryOffsets.getOrDefault(level, 40);
                int x;
                int y;
                if (horizontal) {
                    x = primaryOffset + (primarySize - dimensions.width()) / 2;
                    y = (int) Math.round(center - dimensions.height() / 2.0);
                } else {
                    x = (int) Math.round(center - dimensions.width() / 2.0);
                    y = primaryOffset + (primarySize - dimensions.height()) / 2;
                }
                nodeBounds.put(nodeId, new Bounds(x, y, dimensions.width(), dimensions.height()));
            }
        }

        return new LayoutGrid(nodeBounds);
    }

    private boolean usesExplicitLayout(List<IntermediateNode> nodes) {
        return !nodes.isEmpty() && nodes.stream().allMatch(node ->
                node.x() != null && node.y() != null && node.width() != null && node.height() != null);
    }

    private Map<String, Bounds> computeExplicitNodeBounds(List<IntermediateNode> nodes) {
        Map<String, Bounds> boundsById = new HashMap<>();
        for (IntermediateNode node : nodes) {
            boundsById.put(node.id(), new Bounds(node.x(), node.y(), node.width(), node.height()));
        }
        return boundsById;
    }

    private void reorderLevels(
            Map<Integer, List<String>> orderedNodeIdsByLevel,
            Map<String, List<String>> referenceNeighbors,
            Map<String, Integer> orderById) {
        List<Integer> levels = new ArrayList<>(orderedNodeIdsByLevel.keySet());
        levels.sort(Integer::compareTo);
        for (Integer level : levels) {
            reorderLevel(orderedNodeIdsByLevel.get(level), orderedNodeIdsByLevel, referenceNeighbors, orderById);
        }
    }

    private void reorderLevelsDescending(
            Map<Integer, List<String>> orderedNodeIdsByLevel,
            Map<String, List<String>> referenceNeighbors,
            Map<String, Integer> orderById) {
        List<Integer> levels = new ArrayList<>(orderedNodeIdsByLevel.keySet());
        levels.sort(Comparator.reverseOrder());
        for (Integer level : levels) {
            reorderLevel(orderedNodeIdsByLevel.get(level), orderedNodeIdsByLevel, referenceNeighbors, orderById);
        }
    }

    private void reorderLevel(
            List<String> levelNodeIds,
            Map<Integer, List<String>> orderedNodeIdsByLevel,
            Map<String, List<String>> referenceNeighbors,
            Map<String, Integer> orderById) {
        if (levelNodeIds == null || levelNodeIds.size() < 2) {
            return;
        }

        Map<String, Integer> orderIndexByNodeId = new HashMap<>();
        for (List<String> orderedNodeIds : orderedNodeIdsByLevel.values()) {
            for (int index = 0; index < orderedNodeIds.size(); index++) {
                orderIndexByNodeId.put(orderedNodeIds.get(index), index);
            }
        }

        Map<String, Double> barycenters = new HashMap<>();
        for (int index = 0; index < levelNodeIds.size(); index++) {
            String nodeId = levelNodeIds.get(index);
            List<String> neighbors = referenceNeighbors.getOrDefault(nodeId, List.of());
            double sum = 0;
            int count = 0;
            for (String neighborId : neighbors) {
                Integer neighborIndex = orderIndexByNodeId.get(neighborId);
                if (neighborIndex == null) {
                    continue;
                }
                sum += neighborIndex;
                count += 1;
            }
            barycenters.put(nodeId, count == 0 ? (double) index : sum / count);
        }

        levelNodeIds.sort(Comparator
                .comparingDouble((String nodeId) -> barycenters.getOrDefault(nodeId, Double.MAX_VALUE))
                .thenComparingInt(orderById::get));
    }

    private Double computeDesiredSecondaryCenter(
            String nodeId,
            Map<String, List<String>> incoming,
            Map<String, Double> secondaryCenters) {
        List<String> predecessors = incoming.getOrDefault(nodeId, List.of());
        double sum = 0;
        int count = 0;
        for (String predecessorId : predecessors) {
            Double center = secondaryCenters.get(predecessorId);
            if (center == null) {
                continue;
            }
            sum += center;
            count += 1;
        }
        if (count == 0) {
            return null;
        }
        return sum / count;
    }

    private int displayToLogicalLevel(String direction, int displayLevel, int maxLevel) {
        if ("RL".equals(direction) || "BT".equals(direction)) {
            return maxLevel - displayLevel;
        }
        return displayLevel;
    }

    private Map<String, NodeDimensions> computeNodeDimensions(List<IntermediateNode> nodes) {
        Map<String, NodeDimensions> dimensionsById = new HashMap<>();
        for (IntermediateNode node : nodes) {
            dimensionsById.put(node.id(), computeNodeDimensions(node));
        }
        return dimensionsById;
    }

    private NodeDimensions computeNodeDimensions(IntermediateNode node) {
        String label = node.label() == null ? "" : node.label();
        String[] lines = label.split("\\R", -1);
        int lineCount = Math.max(1, lines.length);
        int longestLineLength = 0;
        for (String line : lines) {
            longestLineLength = Math.max(longestLineLength, line.length());
        }

        int width = Math.max(NODE_MIN_WIDTH, longestLineLength * 7 + 36);
        int height = Math.max(NODE_MIN_HEIGHT, lineCount * 18 + 28);
        if ("rhombus".equals(node.shape())) {
            width += 32;
            height += 20;
        } else if ("ellipse".equals(node.shape())) {
            width += 20;
            height += 10;
        }

        return new NodeDimensions(width, height);
    }

    private Map<String, String> mapNodeToSubgraph(Map<String, IntermediateSubgraph> subgraphById) {
        Map<String, String> nodeToSubgraphId = new HashMap<>();
        for (IntermediateSubgraph subgraph : subgraphById.values()) {
            for (String nodeId : subgraph.nodeIds() == null ? List.<String>of() : subgraph.nodeIds()) {
                nodeToSubgraphId.put(nodeId, subgraph.id());
            }
        }
        return nodeToSubgraphId;
    }

    private List<IntermediateSubgraph> sortSubgraphsForCreation(Map<String, IntermediateSubgraph> subgraphById) {
        List<IntermediateSubgraph> subgraphs = new ArrayList<>(subgraphById.values());
        subgraphs.sort(Comparator.comparingInt(subgraph -> subgraphDepth(subgraph, subgraphById)));
        return subgraphs;
    }

    private int subgraphDepth(IntermediateSubgraph subgraph, Map<String, IntermediateSubgraph> subgraphById) {
        int depth = 0;
        IntermediateSubgraph current = subgraph;
        while (current.parentId() != null) {
            depth += 1;
            current = subgraphById.get(current.parentId());
            if (current == null) {
                break;
            }
        }
        return depth;
    }

    private Map<String, Bounds> computeSubgraphBounds(
            Map<String, IntermediateSubgraph> subgraphById,
            LayoutGrid layoutGrid) {
        Map<String, Bounds> boundsBySubgraphId = new HashMap<>();
        List<IntermediateSubgraph> subgraphs = sortSubgraphsForCreation(subgraphById);
        subgraphs.sort(Comparator.comparingInt((IntermediateSubgraph subgraph) -> subgraphDepth(subgraph, subgraphById)).reversed());

        for (IntermediateSubgraph subgraph : subgraphs) {
            Integer minX = null;
            Integer minY = null;
            Integer maxX = null;
            Integer maxY = null;

            for (String nodeId : subgraph.nodeIds() == null ? List.<String>of() : subgraph.nodeIds()) {
                Bounds nodeBounds = layoutGrid.nodeBounds().get(nodeId);
                if (nodeBounds == null) {
                    continue;
                }
                minX = minX == null ? nodeBounds.x : Math.min(minX, nodeBounds.x);
                minY = minY == null ? nodeBounds.y : Math.min(minY, nodeBounds.y);
                maxX = maxX == null ? nodeBounds.x + nodeBounds.width : Math.max(maxX, nodeBounds.x + nodeBounds.width);
                maxY = maxY == null ? nodeBounds.y + nodeBounds.height : Math.max(maxY, nodeBounds.y + nodeBounds.height);
            }

            for (IntermediateSubgraph candidate : subgraphById.values()) {
                if (!subgraph.id().equals(candidate.parentId())) {
                    continue;
                }
                Bounds childBounds = boundsBySubgraphId.get(candidate.id());
                if (childBounds == null) {
                    continue;
                }
                minX = minX == null ? childBounds.x : Math.min(minX, childBounds.x);
                minY = minY == null ? childBounds.y : Math.min(minY, childBounds.y);
                maxX = maxX == null ? childBounds.x + childBounds.width : Math.max(maxX, childBounds.x + childBounds.width);
                maxY = maxY == null ? childBounds.y + childBounds.height : Math.max(maxY, childBounds.y + childBounds.height);
            }

            if (minX == null || minY == null || maxX == null || maxY == null) {
                continue;
            }

            boundsBySubgraphId.put(
                    subgraph.id(),
                    new Bounds(
                            minX - SUBGRAPH_PADDING_X,
                            minY - SUBGRAPH_PADDING_TOP,
                            (maxX - minX) + 2 * SUBGRAPH_PADDING_X,
                            (maxY - minY) + SUBGRAPH_PADDING_TOP + SUBGRAPH_PADDING_BOTTOM));
        }

        return boundsBySubgraphId;
    }
}
