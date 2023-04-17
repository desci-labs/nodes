# nodes-models: DeSci Labs Research Object Module

`nodes-models` is a module within the DeSci Labs "nodes" open-source repository that provides a simplified and structured way to manage research artifacts, including data, code, PDFs, and more. This module is designed with a focus on supporting semantic web technologies by enabling JSON-LD through the RO-Crate format and planning to support RDF, SPARQL, and more in the future.

The module includes TypeScript interfaces for defining research objects, a conversion script for transforming research objects to and from the RO-Crate format, and sample tests to validate the functionality of the module.

## Features

- TypeScript interfaces for defining research objects with a structured and extensible format.
- Import and export research objects in the RO-Crate format, supporting JSON-LD.
- Validate research objects using TypeScript interfaces and the ts-interface-checker package.
- Support for a wide variety of research artifact types, such as data, code, PDFs, external links, etc.
- Planned support for RDF, SPARQL, and more semantic web technologies.
- Planned support for companion tools to vectorize PDF/document text content for LLM consumption.

## Getting Started

To get started with the `nodes-models` module in the DeSci Labs "nodes" project, follow the steps below:

### Prerequisites

- Make sure you have Node.js (version 14 or higher) and npm (version 6 or higher) installed.

### Installation

1. Clone the DeSci Labs "nodes" repository:

```bash
git clone https://github.com/desci-labs/nodes.git
```

2. Install the dependencies:

```bash
cd nodes
yarn install
```

### Running the Tests

To run the provided tests for the `nodes-models` module, execute the following command:

```bash
yarn test
```

## Usage

### Creating a Research Object

Create a research object using the provided TypeScript interfaces in the `nodes-models` module:

```typescript
import { ResearchObjectV1 } from "./nodes-models/ResearchObject";

const researchObject: ResearchObjectV1 = {
  version: "desci-nodes-0.2.0",
  title: "My Research Project",
  // ...
};
```

### Converting a Research Object to and from RO-Crate format

Import the `RoCrateTransformer` class and use it to convert a research object to and from the RO-Crate format:

```typescript
import { RoCrateTransformer } from "./nodes-models/transformers/RoCrateTransformer";

const transformer = new RoCrateTransformer();
const roCrate = transformer.exportObject(researchObject);
const importedResearchObject = transformer.importObject(roCrate);
```
