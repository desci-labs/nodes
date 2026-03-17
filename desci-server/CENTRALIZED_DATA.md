# Centralized Data Sharing (R2)

Private data storage via Cloudflare R2 — completely parallel to the existing IPFS pipeline. Files are uploaded directly to R2, browsable via a public tree endpoint, and downloadable via authenticated or share-link access.

## Quick Start (Local Dev)

**Prerequisites:** Docker Desktop running, Node.js 20+, yarn installed.

```bash
cd desci-server

# Install dependencies (if not already done)
yarn install

# Start everything (Postgres, Redis, IPFS, Prisma migrations, server)
bash scripts/dev-local.sh
```

Open the test UI: **http://localhost:5420/test/centralizedData.html**

### Local Dev Notes

- **Magic link codes** are auto-filled in the UI (no email sent locally)
- **IPFS is optional** — node creation works without it. The R2 flow doesn't use IPFS.
- The `.env` file is symlinked from the repo root if not present
- R2 credentials must be set in `.env` (see `.env.example` for `R2_*` vars)

## API Endpoints

### Authentication

Uses the existing magic link flow — no new auth endpoints.

```
POST /v1/auth/magic  { email }          → sends verification code
POST /v1/auth/magic  { email, code }    → returns JWT token
```

### Node Management

```
POST /v1/nodes/createDraft              → creates a research node (returns uuid)
GET  /v1/nodes/                         → lists user's nodes
```

### Centralized Data (R2)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/v1/data/uploadCentralized` | POST | JWT (owner) | Upload files to R2. Multipart form: `uuid`, `contextPath`, `files` |
| `/v1/data/centralizedTree/:uuid` | GET | None | List files (public metadata). Optional `?path=` filter |
| `/v1/data/downloadCentralized/:uuid/*` | GET | JWT or `?shareId=` | Download a single file |
| `/v1/data/downloadCentralized/:uuid/zip` | GET | JWT or `?shareId=` | Download all files as ZIP |

### Sharing

```
POST /v1/nodes/share/:uuid             → generates a shareId (requires JWT)
```

Share links allow **unauthenticated** download access:
```
GET /v1/data/downloadCentralized/:uuid/zip?shareId=xxx
GET /v1/data/downloadCentralized/:uuid/path/to/file.pdf?shareId=xxx
```

## Access Control

| Action | Auth Required |
|--------|--------------|
| Upload files | JWT (node owner) |
| Browse file tree | None (public metadata) |
| Download file | JWT (owner) OR valid `shareId` |
| Download ZIP | JWT (owner) OR valid `shareId` |
| Generate share link | JWT (node owner) |
| No auth, no shareId | 403 Forbidden |

## Environment Variables

Required in `.env` (see `.env.example`):

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
```

For deployed environments, these are injected via Vault (see `kubernetes/deployment_dev.yaml`).

## File Structure

```
src/
  services/r2.ts                          # R2 client (S3-compatible)
  controllers/data/uploadCentralized.ts   # Upload endpoint
  controllers/data/centralizedTree.ts     # Tree listing endpoint
  controllers/data/downloadCentralized.ts # Single-file download
  controllers/data/downloadCentralizedZip.ts # ZIP download
  controllers/nodes/share.ts              # Share link generation (existing)
  routes/v1/data.ts                       # Route registration
  test/centralizedData.html               # Stakeholder test UI
scripts/dev-local.sh                      # One-command local dev setup
```

## Testing the Full Flow

1. Open `http://localhost:5420/test/centralizedData.html`
2. Enter email, click "Send Code" (code auto-fills locally)
3. Click "Verify" to sign in
4. Create a node (or select existing)
5. Upload files via drag-and-drop
6. Browse uploaded files in the tree view
7. Click "Download All (ZIP)" to download everything
8. Click "Generate Share Link" to get a shareable ZIP URL
9. Open the share URL in an incognito window — downloads without sign-in
10. Click "Verify Access Controls" to run automated tests

## Deployed URLs

| Environment | Test UI |
|-------------|---------|
| Local | `http://localhost:5420/test/centralizedData.html` |
| Dev | `https://nodes-api-dev.desci.com/test/centralizedData.html` |
| Prod | `https://nodes-api.desci.com/test/centralizedData.html` *(disabled — /test route is gated from production)* |
