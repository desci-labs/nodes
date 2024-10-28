import { Graph, Node, NodeAttribs, serializeEdge, serializeGraph } from "@thi.ng/dot";
import { AllEvents, GenericEvent } from "./history";

const eventAttribs: Partial<NodeAttribs> = {
  fillcolor: "yellow",
  shape: "Mrecord",
  // outs: { out: "next" },
  fontcolor: "black",
};

const formatTimestamp = (timestamp: number) =>
  new Date(timestamp * 1000).toISOString().replace(".000", "");

type HistoryKind = "token" | "stream";

const makeHtmlEventNode = (
  kind: HistoryKind,
  event: GenericEvent,
): Partial<Node> => {
  const tableProps = 'BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4"';
  const label = kind === "token"
    ? `<TABLE ${tableProps}><TR><TD>${formatTimestamp(event.time)}</TD><TD ROWSPAN="2">v${event.v}</TD></TR><TR><TD WIDTH="450" ALIGN="left">${event.cid}</TD></TR></TABLE>`
    : `<TABLE ${tableProps}><TR><TD ROWSPAN="2">v${event.v}</TD><TD>${formatTimestamp(event.time)}</TD></TR><TR><TD WIDTH="450" ALIGN="left">${event.cid}</TD></TR></TABLE>`;

  return {
    ...eventAttribs,
    shape: "none",  // Required for HTML labels
    group: kind,
    label: `<${label}>`,
  };
};

const graphFromHistory = (
  kind: HistoryKind, label: string, history: GenericEvent[]
) => {
  const nodes: Graph["nodes"] = {};
  const edges: Graph["edges"] = [];
  history.forEach(event => {
    nodes[`${kind}:${event.v}`] = makeHtmlEventNode(kind, event);
    if (event.v > 0) {
      edges.push({
        src: `${kind}:${event.v - 1}`,
        dest: `${kind}:${event.v}`
      })
    }
  });

  const attribs: Graph["attribs"] = {
    label,
  };

  return { attribs, nodes, edges };
}

const cidMapEdges = (events: AllEvents) => {
  const edges: Graph["edges"] = [];
  const orphans: number[] = [];

  events.token.history.forEach(tokenEvent => {
    const src = `token:${tokenEvent.v}`;

    const matchingStreamEvent = events.stream.history
      .find(e => e.cid === tokenEvent.cid);
    if (!matchingStreamEvent) {
      orphans.push(tokenEvent.v);
    } else {
      const sameIndex = tokenEvent.v === matchingStreamEvent.v;
      edges.push({
        src,
        dest: `stream:${matchingStreamEvent.v}`,
        constraint: false,
        color: sameIndex ? "green" : "red",
        style: "dashed",
        tailport: "e",
        headport: "w",
      });
    }
  });

  return { edges, orphans };
}

export const generateDot = (allEvents: AllEvents) => {
  const tokenHistorySubgraph = graphFromHistory(
    "token",
    `Token history\n\n${allEvents.token.owner}`,
    allEvents.token.history,
  );

  const streamHistorySubgraph = graphFromHistory(
    "stream",
    `Stream history\n\n${allEvents.stream.owner}`,
    allEvents.stream.history
  );

  const { edges: cidEdges, orphans } = cidMapEdges(allEvents);
  orphans.forEach(o => {
    tokenHistorySubgraph.nodes[`token:${o}`].fillcolor = "orange";
  });

  const graph: Graph = {
    directed: true,
    // global graph attributes
    attribs: {
      rank: "same",
      rankdir: "TB",
      splines: "line",
      fontname: "monospace",
      fontsize: 18,
      fontcolor: "gray",
      labeljust: "c",
      labelloc: "t",
      nodesep: 2,
      // node defaults
      node: {
        style: "filled",
        fontname: "monospace",
        fontsize: 12
      },
      // edge defaults
      edge: {
        arrowsize: 0.75,
      }
    },

    sub: [
      tokenHistorySubgraph,
      streamHistorySubgraph
    ],
    nodes: {},
    edges: cidEdges,
  };


  const serialisedGraph = serializeGraph(graph);

  // Fix html serialisation
  return serialisedGraph
    .replace(/\\"/g, '"')
    .replace(/label="</g, 'label=<')
    .replace(/>>"\]/g, '>>]')
}
