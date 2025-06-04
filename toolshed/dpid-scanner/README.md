# dPID Scanner

A utility tool for scanning the legacy dPID registry on-chain and retrieving all existing dPID to UUID mappings for both development and production environments.

## Overview

This tool connects to the legacy dPID registry smart contract on both development and production networks, scanning through all registered dPIDs and their corresponding UUIDs. It processes the data in batches for efficiency and converts the hex-encoded UUIDs to URL-safe base64 format.

## Usage

1. Install dependencies:
```bash
npm ci
```

Run the scanner:

```bash
npm start
```

The script will:
1. Connect to both development and production chains
2. Scan the dPID registry on each
3. Convert UUIDs from hex to URL-safe base64 format (what's used in the DB)
4. Output the results as a JSON object containing both dev and prod mappings

## Output Format

The output is a JSON object with the following structure:

```json
{
  "dev": {
    "0": "TT8O6PYbxVA3B271W3yBKbnPhs8uPAFGwTeOc1a6qZo",
    "1": "Mm03P0gZc75jv03U6AaMePvDIaweZ-2cEUdOfhS__Co",
    // ... more mappings
  },
  "prod": {
    "0": "TT8O6PYbxVA3B271W3yBKbnPhs8uPAFGwTeOc1a6qZo",
    "1": "Mm03P0gZc75jv03U6AaMePvDIaweZ-2cEUdOfhS__Co",
    // ... more mappings
  }
}
```

## Implementation Details

- Uses `@desci-labs/nodes-lib` for network/contract interaction
- Processes dPIDs in batches of 100 for optimal performance
- Automatically detects the end of the registry when encountering an empty mapping (`0x00` is the default value if unmapped)
