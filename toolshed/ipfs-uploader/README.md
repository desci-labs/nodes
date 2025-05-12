# IPFS Uploader

A Node.js script for uploading files to IPFS using the Kubo RPC client. This script allows you to upload files from a local directory to IPFS with support for glob patterns to filter which files to upload.

## Prerequisites

- Node.js installed on your system
- A local (or tunneled) Kubo RPC API accessible at `http://localhost:5001`

If running Kubo remotely, you'll need to set up port forwarding/tunneling to the RPC port.
Here is an example for the node backing `ipfs.desci.com`:

```bash
kubectl port-forward ipfs-gateway-staging-[pod_ID] 5001:5001
```

## Usage

First, install dependencies:
```bash
pnpm i
```

The script takes two command-line arguments:
1. Directory path to upload
2. Glob pattern to match files, starting at the above path

```bash
node upload.js <directory_path> <glob_pattern>
```

### Examples

Upload all JPG and PNG files recursively:
```bash
node upload.js ./my-files '**/*.{jpg,png}'
```

Upload all files recursively:
```bash
node upload.js ./documents '**/*'
```

## Output

The script will:
1. Display progress as files are being processed
2. Show the CID (Content Identifier) for each uploaded file
3. Output a JSON object mapping file paths to their CIDs

Example output:
```json
{
  "image1.jpg": "bafk...",
  "subfolder/image2.png": "bafy..."
}
```
