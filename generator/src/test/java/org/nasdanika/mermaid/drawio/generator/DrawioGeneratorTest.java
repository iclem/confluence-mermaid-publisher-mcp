package org.nasdanika.mermaid.drawio.generator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.nasdanika.drawio.Connection;
import org.nasdanika.drawio.Document;
import org.nasdanika.drawio.Layer;
import org.nasdanika.drawio.Node;
import org.nasdanika.drawio.Page;
import org.nasdanika.drawio.Root;

class DrawioGeneratorTest {

    @Test
    void generatesValidDrawioXmlForIntermediateDiagram() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "Sample",
                "flowchart",
                "LR",
                List.of(
                        new IntermediateNode("A", "Start", "rectangle"),
                        new IntermediateNode("B", "Decision", "rhombus")),
                List.of(new IntermediateEdge("A", "B", "yes", "directed")),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        String xml = new DrawioGenerator().generate(diagram);

        assertTrue(xml.contains("<mxfile"));
        assertTrue(xml.contains("Sample"));
        assertTrue(xml.contains("Start"));
        assertTrue(xml.contains("Decision"));
        assertTrue(xml.contains("yes"));
        assertTrue(xml.contains("rhombus"));
        assertTrue(xml.contains("classic"));

        Document document = Document.load(xml, null);
        assertEquals(1, document.getPages().size());
        Page page = document.getPages().get(0);
        assertEquals("Sample", page.getName());
        Root root = page.getModel().getRoot();
        assertEquals(1, root.getLayers().size());
        assertEquals(3, root.getLayers().get(0).getElements().size());
    }

    @Test
    void placesLinearLrFlowAcrossProgressiveLevels() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "Linear",
                "flowchart",
                "LR",
                List.of(
                        new IntermediateNode("A", "Start", "rectangle"),
                        new IntermediateNode("B", "Middle", "rounded-rectangle"),
                        new IntermediateNode("C", "End", "ellipse")),
                List.of(
                        new IntermediateEdge("A", "B", null, "directed"),
                        new IntermediateEdge("B", "C", null, "directed")),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        Document document = Document.load(new DrawioGenerator().generate(diagram), null);
        Layer layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node start = findNode(layer, "A");
        Node middle = findNode(layer, "B");
        Node end = findNode(layer, "C");

        assertTrue(start.getGeometry().getX() < middle.getGeometry().getX());
        assertTrue(middle.getGeometry().getX() < end.getGeometry().getX());
        assertTrue(
                Math.abs(
                                (start.getGeometry().getY() + start.getGeometry().getHeight() / 2)
                                        - (middle.getGeometry().getY() + middle.getGeometry().getHeight() / 2))
                        <= 10);
        assertTrue(
                Math.abs(
                                (middle.getGeometry().getY() + middle.getGeometry().getHeight() / 2)
                                        - (end.getGeometry().getY() + end.getGeometry().getHeight() / 2))
                        <= 10);
    }

    @Test
    void separatesBranchedTdSiblingsHorizontally() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "Branching",
                "flowchart",
                "TD",
                List.of(
                        new IntermediateNode("Validate", "Validate Mermaid", "rectangle"),
                        new IntermediateNode("Parse", "Parser ok?", "rhombus"),
                        new IntermediateNode("Generate", "Generate Draw.io", "rectangle"),
                        new IntermediateNode("Retry", "Retry", "rounded-rectangle")),
                List.of(
                        new IntermediateEdge("Validate", "Parse", null, "directed"),
                        new IntermediateEdge("Parse", "Generate", "yes", "directed"),
                        new IntermediateEdge("Parse", "Retry", null, "plain")),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        Document document = Document.load(new DrawioGenerator().generate(diagram), null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node generate = findNode(layer, "Generate");
        Node retry = findNode(layer, "Retry");

        assertEquals(generate.getGeometry().getY(), retry.getGeometry().getY());
        assertTrue(Math.abs(generate.getGeometry().getX() - retry.getGeometry().getX()) >= 140);
    }

    @Test
    void preservesExplicitNodeColorsAndExpandsBoundsForLongLabels() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "Styled",
                "flowchart",
                "TD",
                List.of(
                        new IntermediateNode(
                                "A",
                                "A much longer node label that should widen the shape",
                                "rectangle",
                                "#ffdddd",
                                "#ff0000",
                                "#330000"),
                        new IntermediateNode("B", "Short", "rectangle")),
                List.of(new IntermediateEdge("A", "B", null, "directed")),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        String xml = new DrawioGenerator().generate(diagram);
        assertTrue(xml.contains("#ffdddd"));
        assertTrue(xml.contains("#ff0000"));
        assertTrue(xml.contains("#330000"));

        Document document = Document.load(xml, null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);
        Node wideNode = findNode(layer, "A");
        Node shortNode = findNode(layer, "B");

        assertTrue(wideNode.getGeometry().getWidth() > shortNode.getGeometry().getWidth());
        assertTrue(wideNode.getGeometry().getWidth() > 140);
    }

    @Test
    void rendersMultilineLabelsAsHtmlBreaks() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "Multiline",
                "flowchart",
                "TD",
                List.of(
                        new IntermediateNode("A", "Line 1\nLine 2", "rectangle"),
                        new IntermediateNode("B", "Next", "rectangle")),
                List.of(new IntermediateEdge("A", "B", null, "directed")),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        String xml = new DrawioGenerator().generate(diagram);

        assertTrue(xml.contains("Line 1&lt;br/&gt;Line 2") || xml.contains("Line 1<br/>Line 2"));
    }

    @Test
    void appliesExplicitEdgeWaypointsToFlowchartConnections() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "Waypoints",
                "flowchart",
                "TD",
                List.of(
                        new IntermediateNode("A", "Start", "rectangle"),
                        new IntermediateNode("B", "Target", "rectangle"),
                        new IntermediateNode("C", "Obstacle", "rectangle")),
                List.of(new IntermediateEdge(
                        "A",
                        "B",
                        null,
                        "directed",
                        List.of(
                                new IntermediatePoint(100, 100),
                                new IntermediatePoint(220, 100),
                                new IntermediatePoint(220, 220),
                                new IntermediatePoint(100, 220)))),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        String xml = new DrawioGenerator().generate(diagram);
        Document document = Document.load(xml, null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);
        Connection connection = layer.getElements().stream()
                .filter(Connection.class::isInstance)
                .map(Connection.class::cast)
                .findFirst()
                .orElseThrow(() -> new AssertionError("Connection not found"));

        assertEquals(2, connection.getPoints().size());
        assertTrue(xml.contains("x=\"220.0\" y=\"100.0\""));
        assertTrue(xml.contains("x=\"220.0\" y=\"220.0\""));
    }

    @Test
    void rendersDashedDirectedEdgesAsDashedArrows() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "Dashed",
                "flowchart",
                "TD",
                List.of(
                        new IntermediateNode("A", "Start", "rectangle"),
                        new IntermediateNode("B", "Later", "rectangle")),
                List.of(new IntermediateEdge("A", "B", "eventual", "dashed-directed")),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        String xml = new DrawioGenerator().generate(diagram);

        assertTrue(xml.contains("dashed=1"));
        assertTrue(xml.contains("endArrow=classic"));
    }

    @Test
    void createsContainerNodesForSubgraphs() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "Subgraphs",
                "flowchart",
                "TB",
                List.of(
                        new IntermediateNode("AC", "api-catalogue\nwrite use case", "rectangle"),
                        new IntermediateNode("OB", "Outbox table\n(PostgreSQL)", "rectangle"),
                        new IntermediateNode("PUB", "Outbox publisher", "rectangle")),
                List.of(
                        new IntermediateEdge("AC", "OB", null, "directed"),
                        new IntermediateEdge("OB", "PUB", null, "directed")),
                List.of(new IntermediateSubgraph(
                        "subgraph-1",
                        "Product Write Path",
                        List.of("AC", "OB", "PUB"),
                        null)),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        Document document = Document.load(new DrawioGenerator().generate(diagram), null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node container = layer.getElements().stream()
                .filter(Node.class::isInstance)
                .map(Node.class::cast)
                .filter(node -> "subgraph-1".equals(node.getProperty("id")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Subgraph container not found"));

        assertEquals("Product Write Path", container.getLabel());
        assertEquals(3, container.getChildren().stream().filter(Node.class::isInstance).count());
    }

    @Test
    void placesDeeperDescendantsCloserToTheirActualParentBranch() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "DynamicLayout",
                "flowchart",
                "TD",
                List.of(
                        new IntermediateNode("A", "Start", "rectangle"),
                        new IntermediateNode("B", "Left branch", "rectangle"),
                        new IntermediateNode("C", "Right branch", "rectangle"),
                        new IntermediateNode("D", "Right leaf", "rectangle")),
                List.of(
                        new IntermediateEdge("A", "B", null, "directed"),
                        new IntermediateEdge("A", "C", null, "directed"),
                        new IntermediateEdge("C", "D", null, "directed")),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of());

        Document document = Document.load(new DrawioGenerator().generate(diagram), null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node leftBranch = findNode(layer, "B");
        Node rightBranch = findNode(layer, "C");
        Node rightLeaf = findNode(layer, "D");

        double leftBranchCenter = leftBranch.getGeometry().getX() + leftBranch.getGeometry().getWidth() / 2;
        double rightBranchCenter = rightBranch.getGeometry().getX() + rightBranch.getGeometry().getWidth() / 2;
        double rightLeafCenter = rightLeaf.getGeometry().getX() + rightLeaf.getGeometry().getWidth() / 2;

        assertTrue(Math.abs(rightLeafCenter - rightBranchCenter) < Math.abs(rightLeafCenter - leftBranchCenter));
    }

    @Test
    void generatesSequenceDiagramWithLifelinesMessagesAndNotes() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "Sequence",
                "sequence",
                null,
                List.of(),
                List.of(),
                List.of(),
                List.of(
                        new IntermediateSequenceParticipant("BO", "Backoffice / Internal"),
                        new IntermediateSequenceParticipant("AC", "api-catalogue"),
                        new IntermediateSequenceParticipant("MQ", "RabbitMQ")),
                List.of(
                        new IntermediateSequenceMessage(0, "BO", "AC", "Create or update product", "solid"),
                        new IntermediateSequenceMessage(1, "AC", "AC", "Persist product", "solid"),
                        new IntermediateSequenceMessage(
                                2,
                                "AC",
                                "MQ",
                                "Publish ProductMutationCommitted (via outbox)",
                                "solid")),
                List.of(new IntermediateSequenceNote(
                        3,
                        List.of("AC"),
                        "Legacy post_write HTTP call retired for API writes",
                        "over")),
                List.of(),
                List.of(),
                List.of());

        String xml = new DrawioGenerator().generate(diagram);
        assertTrue(xml.contains("umlLifeline"));
        assertTrue(xml.contains("Create or update product"));
        assertTrue(xml.contains("Persist product"));
        assertTrue(xml.contains("Legacy post_write HTTP call retired for API writes"));

        Document document = Document.load(xml, null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node backoffice = findNode(layer, "BO");
        Node apiCatalogue = findNode(layer, "AC");
        Node rabbitMq = findNode(layer, "MQ");

        assertTrue(backoffice.getGeometry().getX() < apiCatalogue.getGeometry().getX());
        assertTrue(apiCatalogue.getGeometry().getX() < rabbitMq.getGeometry().getX());

        long connectionCount = layer.getElements().stream().filter(Connection.class::isInstance).count();
        assertEquals(3, connectionCount);

        Node note = findNode(layer, "sequence-note-3");
        assertEquals("Legacy post_write HTTP call retired for API writes", note.getLabel());
    }

    @Test
    void generatesSequenceActivationBars() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "SequenceActivations",
                "sequence",
                null,
                List.of(),
                List.of(),
                List.of(),
                List.of(
                        new IntermediateSequenceParticipant("A", "API"),
                        new IntermediateSequenceParticipant("B", "Worker")),
                List.of(
                        new IntermediateSequenceMessage(0, "A", "B", "Dispatch", "solid"),
                        new IntermediateSequenceMessage(1, "B", "B", "Process", "solid"),
                        new IntermediateSequenceMessage(2, "B", "A", "Ack", "dashed")),
                List.of(),
                List.of(new IntermediateSequenceActivation("B", 0, 1, 0)),
                List.of(),
                List.of());

        Document document = Document.load(new DrawioGenerator().generate(diagram), null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node worker = findNode(layer, "B");
        Node activation = worker.getChildren().stream()
                .filter(Node.class::isInstance)
                .map(Node.class::cast)
                .filter(node -> "sequence-activation-B-0-0".equals(node.getProperty("id")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Activation node not found"));

        assertTrue(activation.getGeometry().getHeight() > 0);
        assertTrue(activation.getGeometry().getWidth() > 0);
    }

    @Test
    void generatesSequenceControlFrames() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "SequenceFrames",
                "sequence",
                null,
                List.of(),
                List.of(),
                List.of(),
                List.of(
                        new IntermediateSequenceParticipant("A", "API"),
                        new IntermediateSequenceParticipant("B", "Worker")),
                List.of(
                        new IntermediateSequenceMessage(0, "A", "B", "Dispatch", "solid"),
                        new IntermediateSequenceMessage(1, "B", "B", "Process", "solid"),
                        new IntermediateSequenceMessage(2, "B", "A", "Ack", "dashed")),
                List.of(),
                List.of(),
                List.of(
                        new IntermediateSequenceFrame("opt", "Cache miss", 0, 1, 0),
                        new IntermediateSequenceFrame("loop", "Retry until success", 1, 1, 1)),
                List.of());

        String xml = new DrawioGenerator().generate(diagram);
        assertTrue(xml.contains("umlFrame"));

        Document document = Document.load(xml, null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node optFrame = findNode(layer, "sequence-frame-opt-0-0");
        Node loopFrame = findNode(layer, "sequence-frame-loop-1-1");

        assertEquals("opt", optFrame.getLabel());
        assertEquals("loop", loopFrame.getLabel());

        Node optTitle = optFrame.getChildren().stream()
                .filter(Node.class::isInstance)
                .map(Node.class::cast)
                .filter(node -> "sequence-frame-opt-0-0-title".equals(node.getProperty("id")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Frame title not found"));
        assertEquals("Cache miss", optTitle.getLabel());
        assertTrue(optFrame.getGeometry().getY() < loopFrame.getGeometry().getY());
        assertTrue(optFrame.getGeometry().getX() < loopFrame.getGeometry().getX());
        assertTrue(
                optFrame.getGeometry().getX() + optFrame.getGeometry().getWidth()
                        > loopFrame.getGeometry().getX() + loopFrame.getGeometry().getWidth());
        assertTrue(
                optFrame.getGeometry().getY() + optFrame.getGeometry().getHeight()
                        > loopFrame.getGeometry().getY() + loopFrame.getGeometry().getHeight());
    }

    @Test
    void limitsSequenceFramesToTheirInvolvedLifelines() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "ScopedSequenceFrames",
                "sequence",
                null,
                List.of(),
                List.of(),
                List.of(),
                List.of(
                        new IntermediateSequenceParticipant("A", "API"),
                        new IntermediateSequenceParticipant("B", "Worker"),
                        new IntermediateSequenceParticipant("C", "Audit")),
                List.of(
                        new IntermediateSequenceMessage(0, "B", "B", "Process", "solid"),
                        new IntermediateSequenceMessage(1, "C", "A", "Notify", "dashed")),
                List.of(),
                List.of(),
                List.of(new IntermediateSequenceFrame("opt", "Worker only", 0, 0, 0, List.of("B"))),
                List.of());

        Document document = Document.load(new DrawioGenerator().generate(diagram), null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node scopedFrame = findNode(layer, "sequence-frame-opt-0-0");
        Node worker = findNode(layer, "B");
        Node api = findNode(layer, "A");
        Node audit = findNode(layer, "C");

        double workerLeft = worker.getGeometry().getX();
        double workerRight = workerLeft + worker.getGeometry().getWidth();
        double scopedLeft = scopedFrame.getGeometry().getX();
        double scopedRight = scopedLeft + scopedFrame.getGeometry().getWidth();
        double apiLeft = api.getGeometry().getX();
        double auditRight = audit.getGeometry().getX() + audit.getGeometry().getWidth();

        assertTrue(scopedLeft > apiLeft);
        assertTrue(scopedLeft <= workerLeft);
        assertTrue(scopedRight >= workerRight);
        assertTrue(scopedRight < auditRight);
    }

    @Test
    void generatesSequenceFrameSectionsAndArrowStyles() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "SequenceAlt",
                "sequence",
                null,
                List.of(),
                List.of(),
                List.of(),
                List.of(
                        new IntermediateSequenceParticipant("A", "API"),
                        new IntermediateSequenceParticipant("B", "Worker")),
                List.of(
                        new IntermediateSequenceMessage(0, "A", "B", "Try", "solid"),
                        new IntermediateSequenceMessage(1, "A", "B", "Render", "solid"),
                        new IntermediateSequenceMessage(2, "A", "B", "Passthrough", "solid"),
                        new IntermediateSequenceMessage(3, "B", "A", "Failed", "dotted-cross"),
                        new IntermediateSequenceMessage(4, "B", "A", "Done", "solid-point")),
                List.of(),
                List.of(),
                List.of(new IntermediateSequenceFrame(
                        "alt",
                        "No cache",
                        1,
                        2,
                        0,
                        List.of("A", "B"),
                        List.of(new IntermediateSequenceFrameSection(2, "Cached")))),
                List.of());

        String xml = new DrawioGenerator().generate(diagram);
        assertTrue(xml.contains("endArrow=cross"));
        assertTrue(xml.contains("dashPattern=2 3"));
        assertTrue(xml.contains("endArrow=classic"));

        Document document = Document.load(xml, null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node altFrame = findNode(layer, "sequence-frame-alt-1-0");
        assertEquals("alt", altFrame.getLabel());

        Node divider = altFrame.getChildren().stream()
                .filter(Node.class::isInstance)
                .map(Node.class::cast)
                .filter(node -> "sequence-frame-alt-1-0-section-2".equals(node.getProperty("id")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Frame section divider not found"));
        assertEquals("Cached", divider.getLabel());
    }

    @Test
    void generatesSequenceBoxesNotesAndNumberBadges() throws Exception {
        IntermediateDiagram diagram = new IntermediateDiagram(
                "SequenceBoxes",
                "sequence",
                null,
                List.of(),
                List.of(),
                List.of(),
                List.of(
                        new IntermediateSequenceParticipant("A", "API"),
                        new IntermediateSequenceParticipant("B", "Worker"),
                        new IntermediateSequenceParticipant("C", "Audit")),
                List.of(
                        new IntermediateSequenceMessage(0, "A", "B", "One", "solid", 1),
                        new IntermediateSequenceMessage(1, "B", "A", "Two", "dotted", 2)),
                List.of(new IntermediateSequenceNote(2, List.of("C"), "Side note", "leftOf")),
                List.of(),
                List.of(),
                List.of(new IntermediateSequenceBox("Backend", "rgb(230,240,255)", List.of("B", "C"))),
                List.of());

        String xml = new DrawioGenerator().generate(diagram);
        assertTrue(xml.contains("sequence-box-B"));
        assertTrue(xml.contains("Backend"));
        assertTrue(xml.contains("rgb(230,240,255)"));
        assertTrue(xml.contains("sequence-number-0"));
        assertTrue(xml.contains("sequence-number-1"));

        Document document = Document.load(xml, null);
        Layer<?> layer = document.getPages().get(0).getModel().getRoot().getLayers().get(0);

        Node note = findNode(layer, "sequence-note-2");
        Node audit = findNode(layer, "C");
        double noteRight = note.getGeometry().getX() + note.getGeometry().getWidth();
        double auditCenter = audit.getGeometry().getX() + audit.getGeometry().getWidth() / 2;
        assertTrue(noteRight < auditCenter);
    }

    private Node findNode(Layer<?> layer, String id) {
        return layer.getElements().stream()
                .filter(Node.class::isInstance)
                .map(Node.class::cast)
                .filter(node -> id.equals(node.getProperty("id")))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Node not found: " + id));
    }

}
