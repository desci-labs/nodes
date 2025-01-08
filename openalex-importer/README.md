# OpenAlex Data Importer Script

This script aims to aid with realtime update of our openalex data imports

## Table of Contents

- [Introduction](#introduction)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
  - [Running Locally](#running-locally)
  - [Running in Production](#running-in-production)
  - [Script Arguments](#script-arguments)
- [Common Commands](#common-commands)
  - [Introspect Remote OpenAlex Schema](#introspect-remote-openalex-schema)
  - [Generate Batches Migration](#generate-batches-migration)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Introduction

[Brief explanation of OpenAlex and the purpose of this importer]

## Prerequisites

- Node.js (version X.X or higher)
- Docker
- [Any other requirements]

## Installation

[Steps to install the project]

```bash
git clone <github-url>
cd openalex-importer
yarn install
yarn build
yarn start
```

## Usage

### Running Locally

1. Install dependencies
2. Start Docker service
3. Introspect schema

### Running in Production

1. Install dependencies
2. Start Docker service to run script

### Script Arguments

Run the script using:

```bash
node ./index.js --start=08-24-2024 --end=09-05-2024
```

Note: Arguments are optional

## Common Commands

### Introspect Remote OpenAlex Schema

Set the following environment variables:

```bash
[Your existing env variables]
```

Then run:

```bash
npx drizzle-kit introspect
```

### Generate Batches Migration

```bash
npx drizzle-kit generate --schema=./drizzle/batches.ts --out=./drizzle --dialect=postgresql
```

## Troubleshooting

[Common issues and their solutions]

## Contributing

[How to contribute to the project]

## License

[License information]
