# History Debugger
Utility to compare token and stream histories, useful for investigating migrations and version ordering.

## Setup
Install dependencies:

```bash
npm ci
```

If you want the rendered SVG graph, you need to make sure `dot` is available in your `PATH`, which probably means installing `graphviz` with your package manager.

## Use
To debug a node, you need its (legacy) dPID, and it's streamID. With these at hand, run the script like so:

```bash
DPID=149 STREAM=kjzl6kcym7w8y6wtboiio6jmbpml97m04bji4zphyboqhsckz75qg48efglcjox npx tsx src/index.ts
```

This will generate three files in the `outputs` directory:
- `149.md`: markdown table with metadata and version info
- `149.dot`: raw dot graph for both histories
- `149.svg`: rendered SVG from the dot graph
