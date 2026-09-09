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
    private static final int SEQUENCE_BOX_MARGIN = 15;
    private static final int SEQUENCE_NUMBER_BADGE_SIZE = 14;

    // Style constants mirroring draw.io's native mermaid import (default mermaid theme)
    private static final String SEQUENCE_FONT_FAMILY = "Trebuchet MS,Verdana,Arial,sans-serif";
    private static final String SEQUENCE_TEXT_COLOR = "light-dark(#333333,#cccccc)";
    private static final String SEQUENCE_FILL = "light-dark(#ECECFF,#1f2020)";
    private static final String SEQUENCE_LINE_COLOR = "light-dark(#9370DB,#cccccc)";
    private static final String SEQUENCE_NOTE_FILL = "light-dark(#fff5ad,#2a2a2a)";
    private static final String SEQUENCE_NOTE_STROKE = "light-dark(#aaaa33,#cccccc)";

    private record Bounds(int x, int y, int width, int height) {
    }

    private record NodeDimensions(int width, int height) {
    }

    private record LayoutGrid(Map<String, Bounds> nodeBounds) {
    }

    private record SequenceFrame(Node node, int x, int y, int width, int height, int headerHeight, int centerX, int index) {
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
            if (source == null) {
                // state diagrams connect to/from composite states (subgraph containers)
                source = subgraphNodeMap.get(edge.sourceId());
            }
            if (target == null) {
                target = subgraphNodeMap.get(edge.targetId());
            }
            if (source == null || target == null) {
                throw new IllegalArgumentException("Unknown edge endpoint: " + edge);
            }

            Connection connection = layer.createConnection(source, target);
            if (edge.label() != null && !edge.label().isBlank()) {
                connection.setLabel(edge.label());
            }
            // Container geometry is nested (relative to parent bounds); edges
            // are created on the root layer, so resolve to absolute bounds.
            applyFlowchartEdgeRoute(
                    connection,
                    edge,
                    absoluteNodeBounds(edge.sourceId(), layoutGrid, subgraphById, subgraphBounds),
                    absoluteNodeBounds(edge.targetId(), layoutGrid, subgraphById, subgraphBounds));
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

        IntermediateSequenceGeometry geometry = diagram.sequenceGeometry();

        Map<String, SequenceFrame> participantFrames =
                createSequenceParticipants(layer, participants, participantHeight, geometry);
        for (IntermediateSequenceBox box : diagram.sequenceBoxes() == null ? List.<IntermediateSequenceBox>of() : diagram.sequenceBoxes()) {
            createSequenceBox(layer, box, participantFrames);
        }
        for (IntermediateSequenceFrame frame : frames) {
            createSequenceFrame(layer, frame, participantFrames, geometry);
        }
        for (IntermediateSequenceActivation activation : activations) {
            createSequenceActivation(activation, participantFrames, geometry);
        }
        for (IntermediateSequenceNote note : notes) {
            createSequenceNote(layer, note, participantFrames, participantHeight, geometry);
        }
        for (IntermediateSequenceMessage message : messages) {
            createSequenceMessage(layer, message, participantFrames, participantHeight, geometry);
        }

        return document.save(false);
    }

    private Integer geometryEventY(IntermediateSequenceGeometry geometry, int order) {
        if (geometry == null || geometry.eventYs() == null) {
            return null;
        }
        Double y = geometry.eventYs().get(Integer.toString(order));
        return y == null ? null : (int) Math.round(y);
    }

    private IntermediateSequenceGeometry.Participant geometryParticipant(
            IntermediateSequenceGeometry geometry, String id) {
        if (geometry == null || geometry.participants() == null) {
            return null;
        }
        return geometry.participants().stream()
                .filter(participant -> participant.id().equals(id))
                .findFirst()
                .orElse(null);
    }

    private IntermediateSequenceGeometry.Frame geometryFrame(
            IntermediateSequenceGeometry geometry, int startOrder, int depth) {
        if (geometry == null || geometry.frames() == null) {
            return null;
        }
        return geometry.frames().stream()
                .filter(frame -> frame.startOrder() == startOrder && frame.depth() == depth)
                .findFirst()
                .orElse(null);
    }

    private IntermediateSequenceGeometry.Note geometryNote(
            IntermediateSequenceGeometry geometry, int order) {
        if (geometry == null || geometry.notes() == null) {
            return null;
        }
        return geometry.notes().stream()
                .filter(note -> note.order() == order)
                .findFirst()
                .orElse(null);
    }

    private IntermediateSequenceGeometry.Activation geometryActivation(
            IntermediateSequenceGeometry geometry, String participantId, int startOrder) {
        if (geometry == null || geometry.activations() == null) {
            return null;
        }
        return geometry.activations().stream()
                .filter(activation -> activation.participantId().equals(participantId)
                        && activation.startOrder() == startOrder)
                .findFirst()
                .orElse(null);
    }

    private IntermediateSequenceGeometry.SelfMessage geometrySelfMessage(
            IntermediateSequenceGeometry geometry, int order) {
        if (geometry == null || geometry.selfMessages() == null) {
            return null;
        }
        return geometry.selfMessages().stream()
                .filter(selfMessage -> selfMessage.order() == order)
                .findFirst()
                .orElse(null);
    }

    private Map<String, SequenceFrame> createSequenceParticipants(
            Layer<?> layer,
            List<IntermediateSequenceParticipant> participants,
            int participantHeight,
            IntermediateSequenceGeometry geometry) {
        Map<String, SequenceFrame> frames = new LinkedHashMap<>();
        int currentX = SEQUENCE_LEFT;
        for (int i = 0; i < participants.size(); i++) {
            IntermediateSequenceParticipant participant = participants.get(i);
            boolean isActor = "actor".equals(participant.type());
            IntermediateSequenceGeometry.Participant pg = geometryParticipant(geometry, participant.id());

            int width = pg != null
                    ? (int) Math.round(pg.width())
                    : (isActor ? 35 : computeParticipantWidth(participant.label()));
            int x = pg != null ? (int) Math.round(pg.x()) : currentX;
            int y = pg != null ? (int) Math.round(pg.y()) : SEQUENCE_TOP;
            int headerHeight = pg != null ? (int) Math.round(pg.height()) : SEQUENCE_HEADER_SIZE;
            int height = pg != null
                    ? Math.max(headerHeight, (int) Math.round(pg.lifelineBottom() - pg.y() + pg.height()))
                    : participantHeight;

            Node lifeline = layer.createNode();
            lifeline.setProperty("id", participant.id());
            lifeline.setLabel(formatLabel(participant.label()));

            NodeStyle style = lifeline.getStyle();
            style.shape("umlLifeline");
            style.container(true);
            lifeline.style("collapsible", "0");
            lifeline.style("perimeter", "lifelinePerimeter");
            lifeline.style("dropTarget", "0");
            lifeline.style("recursiveResize", "0");
            lifeline.style("outlineConnect", "0");
            lifeline.style("portConstraint", "eastwest");
            lifeline.style("whiteSpace", "wrap");
            lifeline.style("size", Integer.toString(headerHeight));
            lifeline.style("html", "1");
            lifeline.style("strokeWidth", "2");
            lifeline.style("rounded", "1");
            lifeline.style("absoluteArcSize", "1");
            lifeline.style("arcSize", "6");
            lifeline.style("lifelineDashed", "0");
            lifeline.style("lifelineMirror", "1");
            lifeline.style("lifelineColor", SEQUENCE_LINE_COLOR);
            lifeline.style("fillColor", SEQUENCE_FILL);
            lifeline.style("strokeColor", SEQUENCE_LINE_COLOR);
            lifeline.style("fontColor", SEQUENCE_TEXT_COLOR);
            lifeline.style("fontFamily", SEQUENCE_FONT_FAMILY);
            lifeline.style("fontSize", "16");
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

            lifeline.getGeometry().setBounds(x, y, width, height);
            frames.put(
                    participant.id(),
                    new SequenceFrame(
                            lifeline,
                            x,
                            y,
                            width,
                            height,
                            headerHeight,
                            x + width / 2,
                            i));
            currentX = x + width + SEQUENCE_PARTICIPANT_GAP;
        }

        return frames;
    }

    private void createSequenceBox(
            Layer<?> layer,
            IntermediateSequenceBox box,
            Map<String, SequenceFrame> participantFrames) {
        if (box.participantIds() == null || box.participantIds().isEmpty()) {
            return;
        }

        List<SequenceFrame> frames = box.participantIds().stream()
                .map(participantFrames::get)
                .filter(Objects::nonNull)
                .toList();
        if (frames.isEmpty()) {
            return;
        }

        int minX = frames.stream().mapToInt(SequenceFrame::x).min().orElse(SEQUENCE_LEFT);
        int maxX = frames.stream().mapToInt(frame -> frame.x() + frame.width()).max().orElse(minX);
        SequenceFrame first = frames.get(0);

        Node boxNode = layer.createNode();
        boxNode.setProperty("id", "sequence-box-" + box.participantIds().get(0));
        boxNode.setLabel(box.label() == null || box.label().isBlank() ? null : formatLabel(box.label()));
        NodeStyle style = boxNode.getStyle();
        style.shape("rectangle");
        style.verticalAlign("top");
        if (box.fillColor() != null && !box.fillColor().isBlank()) {
            style.backgroundColor(box.fillColor());
        }
        boxNode.style("whiteSpace", "wrap");
        boxNode.style("spacingTop", "4");
        boxNode.getGeometry().setBounds(
                minX - SEQUENCE_BOX_MARGIN,
                first.y() - SEQUENCE_BOX_MARGIN,
                (maxX - minX) + 2 * SEQUENCE_BOX_MARGIN,
                first.headerHeight() + 2 * SEQUENCE_BOX_MARGIN);
    }

    private void createSequenceFrame(
            Layer<?> layer,
            IntermediateSequenceFrame frame,
            Map<String, SequenceFrame> participantFrames,
            IntermediateSequenceGeometry geometry) {
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

        IntermediateSequenceGeometry.Frame frameGeometry = geometryFrame(geometry, frame.startOrder(), frame.depth());
        if (frameGeometry != null) {
            x = (int) Math.round(frameGeometry.x());
            y = (int) Math.round(frameGeometry.y());
            width = (int) Math.round(frameGeometry.width());
            height = (int) Math.round(frameGeometry.height());
        }

        Node frameNode = layer.createNode();
        String frameId = "sequence-frame-" + frame.kind() + "-" + frame.startOrder() + "-" + frame.depth();
        frameNode.setProperty("id", frameId);
        frameNode.setLabel(formatLabel(frame.kind()));
        NodeStyle style = frameNode.getStyle();
        style.shape("umlFrame");
        frameNode.style("dashed", "1");
        frameNode.style("fixDash", "1");
        frameNode.style("dashPattern", "2 2");
        frameNode.style("strokeWidth", "2");
        frameNode.style("pointerEvents", "0");
        frameNode.style("dropTarget", "0");
        frameNode.style("fillColor", SEQUENCE_FILL);
        frameNode.style("strokeColor", SEQUENCE_LINE_COLOR);
        frameNode.style("fontColor", SEQUENCE_TEXT_COLOR);
        frameNode.style("fontFamily", SEQUENCE_FONT_FAMILY);
        frameNode.style("fontSize", "16");
        frameNode.style("align", "center");
        frameNode.style("verticalAlign", "middle");
        int tabWidth = Math.max(50, frame.kind().length() * 10);
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
        titleStyle.fontSize("16");
        title.style("fontFamily", SEQUENCE_FONT_FAMILY);
        title.style("fontColor", SEQUENCE_TEXT_COLOR);
        title.style("whiteSpace", "wrap");
        title.getGeometry().setBounds(tabWidth + 4, 2, width - tabWidth - 4, SEQUENCE_FRAME_TAB_HEIGHT - 4);

        if (frame.sections() != null) {
            int sectionIndex = 0;
            for (IntermediateSequenceFrameSection section : frame.sections()) {
                Node divider = frameNode.createNode();
                divider.setProperty("id", frameId + "-section-" + section.order());
                divider.style("shape", "line");
                divider.style("dashed", "1");
                divider.style("fixDash", "1");
                divider.style("dashPattern", "2 2");
                divider.style("strokeColor", SEQUENCE_LINE_COLOR);
                int dividerY;
                if (frameGeometry != null
                        && frameGeometry.dividerYs() != null
                        && sectionIndex < frameGeometry.dividerYs().size()) {
                    dividerY = (int) Math.round(frameGeometry.dividerYs().get(sectionIndex)) - y;
                } else {
                    dividerY = computeSequenceEventY(section.order()) - SEQUENCE_ROW_SPACING / 2 - y;
                }
                divider.getGeometry().setBounds(0, dividerY, width, 1);

                Node sectionLabel = frameNode.createNode();
                sectionLabel.setProperty("id", frameId + "-section-label-" + section.order());
                sectionLabel.setLabel(formatLabel(section.label()));
                NodeStyle labelStyle = sectionLabel.getStyle();
                labelStyle.shape("text");
                labelStyle.backgroundColor("none");
                labelStyle.color("none");
                labelStyle.align("center");
                labelStyle.verticalAlign("middle");
                labelStyle.fontSize("16");
                sectionLabel.style("fontFamily", SEQUENCE_FONT_FAMILY);
                sectionLabel.style("fontColor", SEQUENCE_TEXT_COLOR);
                sectionLabel.style("whiteSpace", "wrap");
                sectionLabel.getGeometry().setBounds(0, dividerY + 2, width, SEQUENCE_FRAME_TAB_HEIGHT - 4);
                sectionIndex += 1;
            }
        }
    }

    private void createSequenceActivation(
            IntermediateSequenceActivation activation,
            Map<String, SequenceFrame> participantFrames,
            IntermediateSequenceGeometry geometry) {
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

        IntermediateSequenceGeometry.Activation activationGeometry =
                geometryActivation(geometry, activation.participantId(), activation.startOrder());
        if (activationGeometry != null) {
            activationNode.getGeometry().setBounds(
                    (int) Math.round(activationGeometry.x()) - frame.x(),
                    (int) Math.round(activationGeometry.y()) - frame.y(),
                    (int) Math.round(activationGeometry.width()),
                    (int) Math.round(activationGeometry.height()));
            return;
        }

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
            int participantHeight,
            IntermediateSequenceGeometry geometry) {
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

        int noteX;
        int noteWidth;
        if (("leftOf".equals(note.placement()) || "rightOf".equals(note.placement()))
                && frames.size() == 1) {
            SequenceFrame anchor = frames.get(0);
            noteWidth = Math.max(100, computeParticipantWidth(note.label()) - 20);
            noteX = "leftOf".equals(note.placement())
                    ? anchor.centerX() - SEQUENCE_NOTE_MARGIN - noteWidth
                    : anchor.centerX() + SEQUENCE_NOTE_MARGIN;
        } else {
            noteX = minX - SEQUENCE_NOTE_MARGIN;
            noteWidth = (maxX - minX) + 2 * SEQUENCE_NOTE_MARGIN;
        }

        Node noteNode = layer.createNode();
        noteNode.setProperty("id", "sequence-note-" + note.order());
        noteNode.setLabel(formatLabel(note.label()));
        NodeStyle noteStyle = noteNode.getStyle();
        noteStyle.shape("rectangle");
        noteStyle.backgroundColor(SEQUENCE_NOTE_FILL);
        noteStyle.color(SEQUENCE_NOTE_STROKE);
        noteStyle.fontColor(SEQUENCE_TEXT_COLOR);
        noteStyle.fontSize("16");
        noteNode.style("fontFamily", SEQUENCE_FONT_FAMILY);
        noteNode.style("html", "1");
        noteStyle.align("center");
        noteStyle.verticalAlign("middle");
        noteNode.style("whiteSpace", "wrap");

        IntermediateSequenceGeometry.Note noteGeometry = geometryNote(geometry, note.order());
        if (noteGeometry != null) {
            noteNode.getGeometry().setBounds(
                    (int) Math.round(noteGeometry.x()),
                    (int) Math.round(noteGeometry.y()),
                    (int) Math.round(noteGeometry.width()),
                    (int) Math.round(noteGeometry.height()));
            return;
        }
        noteNode.getGeometry().setBounds(noteX, noteY - SEQUENCE_NOTE_HEIGHT / 2, noteWidth, SEQUENCE_NOTE_HEIGHT);
    }

    private void createSequenceMessage(
            Layer<?> layer,
            IntermediateSequenceMessage message,
            Map<String, SequenceFrame> participantFrames,
            int participantHeight,
            IntermediateSequenceGeometry geometry) {
        SequenceFrame sourceFrame = participantFrames.get(message.sourceId());
        SequenceFrame targetFrame = participantFrames.get(message.targetId());
        if (sourceFrame == null || targetFrame == null) {
            throw new IllegalArgumentException("Unknown sequence participant in message: " + message);
        }

        Integer geometryY = geometryEventY(geometry, message.order());
        int absoluteY = geometryY != null ? geometryY : computeSequenceEventY(message.order());
        if (sourceFrame.index() == targetFrame.index()) {
            createSelfSequenceMessage(layer, sourceFrame, message, absoluteY, geometry);
            if (message.number() != null) {
                createSequenceNumberBadge(
                        layer,
                        message,
                        sourceFrame.x() + sourceFrame.width() + SEQUENCE_SELF_LOOP_WIDTH,
                        absoluteY);
            }
            return;
        }

        boolean leftToRight = sourceFrame.centerX() < targetFrame.centerX();
        ConnectionPoint sourcePoint = sourceFrame.node()
                .createConnectionPoint(leftToRight ? 1.0 : 0.0, toRelativeY(absoluteY, sourceFrame));
        ConnectionPoint targetPoint = targetFrame.node()
                .createConnectionPoint(leftToRight ? 0.0 : 1.0, toRelativeY(absoluteY, targetFrame));
        Connection connection = layer.createConnection(sourcePoint, targetPoint);
        connection.setLabel(message.label());
        configureSequenceMessageStyle(connection, message.kind());
        connection.getPoints().add((sourceFrame.centerX() + targetFrame.centerX()) / 2.0, absoluteY);
        if (message.number() != null) {
            createSequenceNumberBadge(
                    layer,
                    message,
                    (sourceFrame.centerX() + targetFrame.centerX()) / 2,
                    absoluteY);
        }
    }

    private void createSequenceNumberBadge(
            Layer<?> layer,
            IntermediateSequenceMessage message,
            int centerX,
            int absoluteY) {
        Node badge = layer.createNode();
        badge.setProperty("id", "sequence-number-" + message.order());
        badge.setLabel(Integer.toString(message.number()));
        NodeStyle style = badge.getStyle();
        style.shape("ellipse");
        style.backgroundColor("#000000");
        style.color("#000000");
        style.fontColor("#FFFFFF");
        style.align("center");
        style.verticalAlign("middle");
        badge.style("aspect", "fixed");
        badge.style("whiteSpace", "wrap");
        int half = SEQUENCE_NUMBER_BADGE_SIZE / 2;
        badge.getGeometry().setBounds(
                centerX - half,
                absoluteY - SEQUENCE_NUMBER_BADGE_SIZE + 2,
                SEQUENCE_NUMBER_BADGE_SIZE,
                SEQUENCE_NUMBER_BADGE_SIZE);
    }

    private void createSelfSequenceMessage(
            Layer<?> layer,
            SequenceFrame frame,
            IntermediateSequenceMessage message,
            int absoluteY,
            IntermediateSequenceGeometry geometry) {
        IntermediateSequenceGeometry.SelfMessage selfGeometry = geometrySelfMessage(geometry, message.order());
        int loopBottom = absoluteY + SEQUENCE_SELF_LOOP_HEIGHT;
        if (selfGeometry != null && selfGeometry.points() != null && selfGeometry.points().size() >= 2) {
            loopBottom = (int) Math.round(selfGeometry.points().get(1).y());
        }
        ConnectionPoint sourcePoint = frame.node().createConnectionPoint(1.0, toRelativeY(absoluteY, frame));
        ConnectionPoint targetPoint =
                frame.node().createConnectionPoint(1.0, toRelativeY(loopBottom, frame));
        Connection connection = layer.createConnection(sourcePoint, targetPoint);
        connection.setLabel(message.label());
        configureSequenceMessageStyle(connection, message.kind());
        connection.getStyle().put("curved", "1");
        int loopX = selfGeometry != null && selfGeometry.points() != null && !selfGeometry.points().isEmpty()
                ? (int) Math.round(selfGeometry.points().get(0).x())
                : frame.x() + frame.width() + SEQUENCE_SELF_LOOP_WIDTH;
        connection.getPoints().add(loopX, absoluteY);
        connection.getPoints().add(loopX, loopBottom);
    }

    private void configureSequenceMessageStyle(Connection connection, String kind) {
        ConnectionStyle style = connection.getStyle();
        style.edgeStyle("elbowEdgeStyle");
        style.rounded(false);
        connection.style("verticalAlign", "bottom");
        connection.style("elbow", "vertical");
        connection.style("curved", "0");
        connection.style("fontSize", "16");
        connection.style("fontFamily", SEQUENCE_FONT_FAMILY);
        connection.style("labelBackgroundColor", "none");
        connection.style("strokeWidth", "1.5");
        connection.style("strokeColor", SEQUENCE_TEXT_COLOR);
        connection.style("fontColor", SEQUENCE_TEXT_COLOR);

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

        if (dotted) {
            connection.style("dashed", "1");
            connection.style("fixDash", "1");
            connection.style("dashPattern", "3 3");
        } else {
            style.dashed("0");
        }
        style.endArrow(endArrow);
        connection.style("endSize", "classic".equals(endArrow) ? "10" : "9");
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

    private double toRelativeY(int absoluteY, SequenceFrame frame) {
        return (double) (absoluteY - frame.y()) / frame.height();
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
        } else if ("stadium".equals(shape)) {
            style.shape("rectangle");
            style.rounded(true);
            node.style("arcSize", "50");
        } else if ("cylinder".equals(shape)) {
            style.shape("cylinder");
        } else if ("hexagon".equals(shape)) {
            style.shape("hexagon");
        } else if ("parallelogram".equals(shape)) {
            style.shape("parallelogram");
        } else if ("parallelogram-alt".equals(shape)) {
            style.shape("parallelogram");
            node.style("flipH", "1");
        } else if ("trapezoid".equals(shape)) {
            style.shape("trapezoid");
        } else if ("trapezoid-alt".equals(shape)) {
            style.shape("trapezoid");
            node.style("flipV", "1");
        } else if ("subroutine".equals(shape)) {
            style.shape("mxgraph.flowchart.predefined_process");
        } else if ("double-circle".equals(shape)) {
            // draw.io has no double-bordered ellipse; closest stock shape
            style.shape("ellipse");
        } else if ("odd".equals(shape)) {
            // mermaid's asymmetric right-rounded rectangle; approximate
            style.shape("rectangle");
            style.rounded(true);
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

    /**
     * Resolves the absolute (root-layer) bounds of a node id, walking up its
     * subgraph container chain — container bounds are stored nested
     * (parent-relative) while edge points are absolute.
     */
    private Bounds absoluteNodeBounds(
            String nodeId,
            LayoutGrid layoutGrid,
            Map<String, IntermediateSubgraph> subgraphById,
            Map<String, Bounds> subgraphBounds) {
        if (nodeId == null) {
            return null;
        }
        Bounds bounds = layoutGrid.nodeBounds().get(nodeId);
        if (bounds == null) {
            return null;
        }
        int x = bounds.x();
        int y = bounds.y();
        String parentId = null;
        for (IntermediateSubgraph subgraph : subgraphById.values()) {
            if (subgraph.nodeIds() != null && subgraph.nodeIds().contains(nodeId)) {
                parentId = subgraph.parentId();
                IntermediateSubgraph container = subgraph;
                Bounds containerBounds = subgraphBounds.get(container.id());
                if (containerBounds != null) {
                    x += containerBounds.x();
                    y += containerBounds.y();
                }
                while (parentId != null) {
                    Bounds parentBounds = subgraphBounds.get(parentId);
                    if (parentBounds == null) {
                        break;
                    }
                    x += parentBounds.x();
                    y += parentBounds.y();
                    IntermediateSubgraph parent = subgraphById.get(parentId);
                    parentId = parent == null ? null : parent.parentId();
                }
                break;
            }
        }
        return new Bounds(x, y, bounds.width(), bounds.height());
    }

    private void applyFlowchartEdgeRoute(
            Connection connection,
            IntermediateEdge edge,
            Bounds sourceBounds,
            Bounds targetBounds) {
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

        // Dagre routes to a padded routing box that can sit far outside the
        // drawn shape (e.g. cylinders): the extracted polyline then starts
        // hundreds of pixels away from the node and walks toward it. Emitted
        // as-is, draw.io draws the exit/entry anchor to the far first/last
        // waypoint and back — a sharp triangle spike. Trim the phantom lead-in
        // (and lead-out) where the polyline monotonically approaches the
        // visible node bbox, so the first/last retained point sits at the
        // perimeter.
        int startIndex = trimPhantomLead(points, sourceBounds, true);
        int endIndex = trimPhantomLead(points, targetBounds, false);

        // Stock draw.io mermaid import style: perimeter-relative exit/entry
        // constraints plus interior waypoints only — never absolute
        // source/target points; ratios are clamped into the [0,1] band as a
        // safety net.
        IntermediatePoint sourcePoint = points.get(startIndex);
        IntermediatePoint targetPoint = points.get(endIndex);
        if (sourceBounds != null && sourceBounds.width() > 0 && sourceBounds.height() > 0) {
            IntermediatePoint clamped = clampToBounds(sourcePoint, sourceBounds);
            connection.style("exitX", twoDecimals((clamped.x() - sourceBounds.x()) / (double) sourceBounds.width()));
            connection.style("exitY", twoDecimals((clamped.y() - sourceBounds.y()) / (double) sourceBounds.height()));
        }
        if (targetBounds != null && targetBounds.width() > 0 && targetBounds.height() > 0) {
            IntermediatePoint clamped = clampToBounds(targetPoint, targetBounds);
            connection.style("entryX", twoDecimals((clamped.x() - targetBounds.x()) / (double) targetBounds.width()));
            connection.style("entryY", twoDecimals((clamped.y() - targetBounds.y()) / (double) targetBounds.height()));
        }
        for (int i = startIndex + 1; i < endIndex; i++) {
            IntermediatePoint point = points.get(i);
            connection.getPoints().add(point.x(), point.y());
        }
    }

    private static IntermediatePoint clampToBounds(IntermediatePoint point, Bounds bounds) {
        int x = Math.max(bounds.x(), Math.min(bounds.x() + bounds.width(), point.x()));
        int y = Math.max(bounds.y(), Math.min(bounds.y() + bounds.height(), point.y()));
        return new IntermediatePoint(x, y);
    }

    /**
     * Drops the phantom lead-in of a polyline whose first points walk toward
     * the terminal node's visible bbox from dagre's padded routing box: while
     * the next point is strictly closer to the bbox than the current one, the
     * current point cannot be the visible route's start. Returns the index of
     * the first retained point (source end) or the last retained point (target
     * end).
     */
    private static int trimPhantomLead(List<IntermediatePoint> points, Bounds bounds, boolean sourceEnd) {
        if (bounds == null) {
            return sourceEnd ? 0 : points.size() - 1;
        }
        if (sourceEnd) {
            int index = 0;
            while (index + 1 < points.size()
                    && distanceToBounds(points.get(index + 1), bounds) < distanceToBounds(points.get(index), bounds) - 0.5) {
                index += 1;
            }
            return index;
        }
        int index = points.size() - 1;
        while (index - 1 >= 0
                && distanceToBounds(points.get(index - 1), bounds) < distanceToBounds(points.get(index), bounds) - 0.5) {
            index -= 1;
        }
        return index;
    }

    private static double distanceToBounds(IntermediatePoint point, Bounds bounds) {
        int dx = Math.max(bounds.x() - point.x(), Math.max(0, point.x() - (bounds.x() + bounds.width())));
        int dy = Math.max(bounds.y() - point.y(), Math.max(0, point.y() - (bounds.y() + bounds.height())));
        return Math.hypot(dx, dy);
    }

    private static String twoDecimals(double value) {
        double clamped = Math.max(-1, Math.min(2, value));
        double rounded = Math.round(clamped * 100) / 100.0;
        if (rounded == Math.floor(rounded)) {
            return Integer.toString((int) rounded);
        }
        return Double.toString(rounded);
    }

    private void applyConnectionStyle(Connection connection, String kind, boolean hasExplicitRoute) {
        ConnectionStyle style = connection.getStyle();
        if (hasExplicitRoute) {
            // curved=1 (set by the route step when dagre's terminal anchor
            // falls outside the node bbox) overrides the straight segments
            style.remove("edgeStyle");
            style.rounded(false);
        } else {
            style.edgeStyle("orthogonalEdgeStyle").rounded(true);
        }
        style.color("#666666");
        if (kind == null) {
            kind = "directed";
        }
        boolean arrow = !"plain".equals(kind) && !"dashed-plain".equals(kind)
                && !"thick-plain".equals(kind) && !"invisible".equals(kind);
        if (arrow) {
            style.endArrow("classic");
            style.endFill(true);
        } else {
            style.endArrow("none");
        }
        if (kind.startsWith("bidirectional-")) {
            connection.style("startArrow", "classic");
            connection.style("startFill", "1");
        }
        if (kind.contains("thick")) {
            connection.style("strokeWidth", "2");
        }
        if ("invisible".equals(kind)) {
            connection.style("strokeColor", "none");
        }
        style.dashed(kind.contains("dashed") ? "1" : "0");
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
        Set<String> nodeIds = new HashSet<>();
        for (IntermediateNode node : nodes) {
            nodeIds.add(node.id());
            outgoing.put(node.id(), new ArrayList<>());
            incoming.put(node.id(), new ArrayList<>());
            indegree.put(node.id(), 0);
        }

        for (IntermediateEdge edge : diagram.edges() == null ? List.<IntermediateEdge>of() : diagram.edges()) {
            // Edges incident to subgraph containers (composite states) do not
            // participate in node ranking
            if (!nodeIds.contains(edge.sourceId()) || !nodeIds.contains(edge.targetId())) {
                continue;
            }
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
