import { AllEvents } from "./history";

export const renderMarkdown = (allEvents: AllEvents) => {
  const { token, stream, merged } = allEvents;
  const metadataMarkdown = [
    '# Metadata ',
    '| Type   | Owner           | ID           |',
    '|--------|-----------------|--------------|',
    `| token  | ${token.owner}  | ${token.id}  |`,
    `| stream | ${stream.owner} | ${stream.id} |`
  ];

  const historyMarkdown = [
    '# History',
    '| Date | Token (by blocktime) | Stream (by JWT timestamp) |',
    '|------|-------------------|------------------------|'
  ];

  merged.forEach(e => {
    const dateStr = new Date(e.time * 1000).toISOString();
    const isStreamEvent = "anchor" in e;
    const version = `(${e.v}) ${e.cid}`;

    if (isStreamEvent) {
      historyMarkdown.push(`| ${dateStr} |            | ${version} |`);
    } else {
      historyMarkdown.push(`| ${dateStr} | ${version} |            |`);
    }
  });

  return [...metadataMarkdown, ...historyMarkdown].join('\n');
}

