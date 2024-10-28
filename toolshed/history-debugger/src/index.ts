import { mkdirSync, writeFileSync } from "fs";
import which from 'which';

import { generateDot } from "./graph";
import { getAllEvents } from "./history";
import { renderMarkdown } from "./markdown";
import { exec, spawnSync } from "child_process";

if (!process.env.DPID || !process.env.STREAM) {
  console.error('DPID and STREAM envvars required');
  process.exit(1);
}

const dpid = parseInt(process.env.DPID);
const streamId = process.env.STREAM;

const allEvents = await getAllEvents(dpid, streamId);

// Create outdir if it doesn't exist
mkdirSync('outputs', { recursive: true });

// Generate and save markdown
const mdPath = `outputs/${dpid}.md`;
const markdown = renderMarkdown(allEvents);
console.error(`📃 Saving markdown to ${mdPath}`);
writeFileSync(mdPath, markdown);

// Generate and save dot graph
const dotPath = `outputs/${dpid}.dot`;
const dot = generateDot(allEvents);
console.error(`📈 Saving dot graph to ${dotPath}`);
writeFileSync(dotPath, dot);

if (await which('dot')) {
  const svgPath = `outputs/${dpid}.svg`;
  console.error(`🎨 Rendering graph to ${svgPath}`);
  exec(`dot -Tsvg -o ${svgPath} ${dotPath}`);
} else {
  console.error(`🤷 'dot' command not installed, skipping to render svg`)
}
