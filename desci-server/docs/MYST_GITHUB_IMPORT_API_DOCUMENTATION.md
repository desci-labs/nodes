# MyST GitHub Import API Documentation

## Overview

The MyST GitHub Import API provides functionality to import MyST (Markedly Structured Text) documents from GitHub repositories into DeSci Nodes research objects. This API supports asynchronous processing with job status tracking, allowing users to monitor the progress of their import operations and manage them as needed.

## Base URL

The API is available at the following endpoints:

- **Development**: `http://localhost:5420`
- **Staging**: `https://nodes-api-dev.desci.com`
- **Production**: `https://nodes-api.desci.com`

## Authentication

All endpoints require authentication via Bearer token in the Authorization header:

```
Authorization: Bearer <your-token>
```

## Endpoints

### 1. POST /v1/nodes/:uuid/github-myst-import

Initiates a MyST document import from a GitHub repository.

#### Path Parameters

| Parameter | Type   | Required | Description                 |
| --------- | ------ | -------- | --------------------------- |
| `uuid`    | string | Yes      | The UUID of the target node |

#### Request Body

| Field    | Type    | Required | Description                                                                                                         |
| -------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `url`    | string  | Yes      | GitHub URL to the MyST YAML file (must match pattern: `https://github.com/{owner}/{repo}/blob/{branch}/{path}.yml`) |
| `dryRun` | boolean | No       | If true, validates the import without executing it (default: false)                                                 |

#### Request Example

```bash
curl -X POST "https://nodes-api.desci.com/v1/nodes/123e4567-e89b-12d3-a456-426614174000/github-myst-import" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/owner/repo/blob/main/myst.yml",
    "dryRun": false
  }'
```

#### Response Schema

**Success Response (200)**

```json
{
  "data": {
    "jobId": "string",
    "debug": {
      "actions": [
        {
          "type": "Update Title",
          "title": "string"
        },
        {
          "type": "Update Description",
          "description": "string"
        },
        {
          "type": "Set Contributors",
          "contributors": [
            {
              "id": "string",
              "name": "string",
              "role": [],
              "email": "string",
              "orcid": "string",
              "organizations": [
                {
                  "id": "string",
                  "name": "string"
                }
              ]
            }
          ]
        },
        {
          "type": "Update License",
          "defaultLicense": "string"
        },
        {
          "type": "Set Keywords",
          "keywords": ["string"]
        }
      ],
      "parsedDocument": {
        "title": "string",
        "description": "string",
        "authors": [
          {
            "name": "string",
            "email": "string",
            "affiliation": "string",
            "orcid": "string"
          }
        ],
        "license": {
          "content": {
            "id": "string"
          },
          "code": {
            "id": "string"
          }
        },
        "keywords": ["string"],
        "affiliations": [
          {
            "name": "string"
          }
        ]
      }
    }
  }
}
```

**Dry Run Response (200)**

```json
{
  "data": {
    "ok": true,
    "debug": {
      "actions": [...],
      "parsedDocument": {...}
    }
  }
}
```

#### Response Fields

| Field   | Type    | Description                                                                         |
| ------- | ------- | ----------------------------------------------------------------------------------- |
| `jobId` | string  | Unique identifier for tracking the import job (only present when dryRun=false)      |
| `debug` | object  | Debug information including parsed actions and document (only for @desci.com users) |
| `ok`    | boolean | Indicates successful validation (only present in dry run mode)                      |

#### HTTP Status Codes

| Code | Description                                                       |
| ---- | ----------------------------------------------------------------- |
| 200  | Success - Import initiated or validation completed                |
| 400  | Bad Request - Invalid URL format or YAML validation failed        |
| 404  | Not Found - Node not found or not initialized                     |
| 422  | Unprocessable Entity - Unable to extract metadata from manuscript |
| 500  | Internal Server Error - Failed to schedule job                    |

---

### 2. GET /v1/nodes/:uuid/github-myst-import/:jobId

Retrieves the current status of a MyST import job.

#### Path Parameters

| Parameter | Type   | Required | Description                 |
| --------- | ------ | -------- | --------------------------- |
| `uuid`    | string | Yes      | The UUID of the target node |
| `jobId`   | string | Yes      | The unique job identifier   |

#### Request Example

```bash
curl -X GET "https://nodes-api.desci.com/v1/nodes/123e4567-e89b-12d3-a456-426614174000/github-myst-import/myst-import-abc123" \
  -H "Authorization: Bearer <your-token>"
```

#### Response Schema

```json
{
  "data": {
    "uuid": "string",
    "url": "string",
    "userId": "number",
    "status": "processing | completed | failed | cancelled",
    "message": "string",
    "parsedDocument": {
      "title": "string",
      "description": "string",
      "authors": [
        {
          "name": "string",
          "email": "string",
          "affiliation": "string",
          "orcid": "string"
        }
      ],
      "license": {
        "content": {
          "id": "string"
        },
        "code": {
          "id": "string"
        }
      },
      "keywords": ["string"],
      "affiliations": [
        {
          "name": "string"
        }
      ]
    },
    "value": {
      "tree": [
        {
          "name": "string",
          "path": "string",
          "cid": "string",
          "componentType": "string",
          "componentSubtype": "string",
          "contains": [
            {
              "name": "string",
              "path": "string",
              "cid": "string",
              "componentType": "string"
            }
          ]
        }
      ]
    }
  }
}
```

#### Response Fields

| Field            | Type   | Description                                                             |
| ---------------- | ------ | ----------------------------------------------------------------------- |
| `uuid`           | string | The UUID of the target node                                             |
| `url`            | string | The original GitHub URL that was imported                               |
| `userId`         | number | ID of the user who initiated the import                                 |
| `status`         | string | Current job status: `processing`, `completed`, `failed`, or `cancelled` |
| `message`        | string | Human-readable status message                                           |
| `parsedDocument` | object | The parsed MyST document metadata                                       |
| `value`          | object | File processing results (only present when status is `completed`)       |

#### Job Status Values

| Status       | Description                                             |
| ------------ | ------------------------------------------------------- |
| `processing` | Job is currently being processed                        |
| `completed`  | Job completed successfully and files have been imported |
| `failed`     | Job failed due to an error                              |
| `cancelled`  | Job was cancelled by the user                           |

#### HTTP Status Codes

| Code | Description                    |
| ---- | ------------------------------ |
| 200  | Success - Job status retrieved |
| 404  | Not Found - Job not found      |

---

### 3. POST /v1/nodes/:uuid/github-myst-import/:jobId/cancel

Cancels a running MyST import job.

#### Path Parameters

| Parameter | Type   | Required | Description                 |
| --------- | ------ | -------- | --------------------------- |
| `uuid`    | string | Yes      | The UUID of the target node |
| `jobId`   | string | Yes      | The unique job identifier   |

#### Request Example

```bash
curl -X POST "https://nodes-api.desci.com/v1/nodes/123e4567-e89b-12d3-a456-426614174000/github-myst-import/myst-import-abc123/cancel" \
  -H "Authorization: Bearer <your-token>"
```

#### Response Schema

```json
{
  "data": {
    "uuid": "string",
    "url": "string",
    "userId": "number",
    "status": "cancelled",
    "message": "Job cancelled",
    "parsedDocument": {
      "title": "string",
      "description": "string",
      "authors": [...],
      "license": {...},
      "keywords": [...],
      "affiliations": [...]
    }
  }
}
```

#### HTTP Status Codes

| Code | Description               |
| ---- | ------------------------- |
| 200  | Success - Job cancelled   |
| 404  | Not Found - Job not found |

---

### 4. POST /v1/nodes/:uuid/github-myst-import/:jobId/updateStatus

Updates the status of a MyST import job. This is an internal endpoint used by the processing service.

#### Path Parameters

| Parameter | Type   | Required | Description                 |
| --------- | ------ | -------- | --------------------------- |
| `uuid`    | string | Yes      | The UUID of the target node |
| `jobId`   | string | Yes      | The unique job identifier   |

#### Request Body

| Field     | Type   | Required | Description                                                         |
| --------- | ------ | -------- | ------------------------------------------------------------------- |
| `status`  | string | Yes      | New job status: `processing`, `completed`, `failed`, or `cancelled` |
| `message` | string | Yes      | Human-readable status message                                       |

#### Request Example

```bash
curl -X POST "https://nodes-api.desci.com/v1/nodes/123e4567-e89b-12d3-a456-426614174000/github-myst-import/myst-import-abc123/updateStatus" \
  -H "Authorization: Bearer <internal-secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed",
    "message": "Import finished successfully"
  }'
```

#### Response Schema

```json
{
  "data": {
    "uuid": "string",
    "url": "string",
    "userId": "number",
    "status": "string",
    "message": "string",
    "parsedDocument": {
      "title": "string",
      "description": "string",
      "authors": [...],
      "license": {...},
      "keywords": [...],
      "affiliations": [...]
    }
  }
}
```

#### HTTP Status Codes

| Code | Description                  |
| ---- | ---------------------------- |
| 200  | Success - Job status updated |
| 404  | Not Found - Job not found    |

**Note**: This endpoint requires internal authentication and is not intended for external use.

---

### 5. POST /v1/nodes/:uuid/finalize-myst-import/:jobId/receiveFiles

Receives and processes files from the MyST import job. This is an internal endpoint used by the processing service.

#### Path Parameters

| Parameter | Type   | Required | Description                 |
| --------- | ------ | -------- | --------------------------- |
| `uuid`    | string | Yes      | The UUID of the target node |
| `jobId`   | string | Yes      | The unique job identifier   |

#### Request Body

This endpoint expects a multipart/form-data request with file uploads.

#### Request Example

```bash
curl -X POST "https://nodes-api.desci.com/v1/nodes/123e4567-e89b-12d3-a456-426614174000/finalize-myst-import/myst-import-abc123/receiveFiles" \
  -H "Authorization: Bearer <internal-secret>" \
  -F "files=@document.pdf" \
  -F "files=@data.csv"
```

#### Response Schema

```json
{
  "data": {
    "uuid": "string",
    "url": "string",
    "userId": "number",
    "status": "completed | failed",
    "message": "string",
    "parsedDocument": {
      "title": "string",
      "description": "string",
      "authors": [...],
      "license": {...},
      "keywords": [...],
      "affiliations": [...]
    },
    "value": {
      "tree": [
        {
          "name": "string",
          "path": "string",
          "cid": "string",
          "componentType": "string",
          "componentSubtype": "string",
          "contains": [
            {
              "name": "string",
              "path": "string",
              "cid": "string",
              "componentType": "string"
            }
          ]
        }
      ]
    }
  }
}
```

#### HTTP Status Codes

| Code | Description                                    |
| ---- | ---------------------------------------------- |
| 200  | Success - Files processed and imported         |
| 400  | Bad Request - No files received                |
| 404  | Not Found - Job not found                      |
| 422  | Unprocessable Entity - Could not process files |

**Note**: This endpoint requires internal authentication and is not intended for external use.

## Error Response Format

All endpoints return errors in the following format:

```json
{
  "error": "string"
}
```

## MyST YAML Format

The MyST YAML file should follow this structure:

```yaml
version: 1
project:
  id: 'project-identifier'
  title: 'Project Title'
  description: 'Project description'
  authors:
    - name: 'Author Name'
      email: 'author@example.com'
      affiliation: 'Institution Name'
      orcid: '0000-0000-0000-0000'
  license:
    content:
      id: 'license-id'
    code:
      id: 'license-id'
  keywords:
    - 'keyword1'
    - 'keyword2'
```

## Workflow Example

### 1. Initiate Import

```bash
curl -X POST "https://nodes-api.desci.com/v1/nodes/123e4567-e89b-12d3-a456-426614174000/github-myst-import" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://github.com/owner/repo/blob/main/myst.yml"
  }'
```

**Response:**

```json
{
  "data": {
    "jobId": "myst-import-abc123"
  }
}
```

### 2. Check Status

```bash
curl -X GET "https://nodes-api.desci.com/v1/nodes/123e4567-e89b-12d3-a456-426614174000/github-myst-import/myst-import-abc123" \
  -H "Authorization: Bearer <your-token>"
```

**Response (Processing):**

```json
{
  "data": {
    "uuid": "123e4567-e89b-12d3-a456-426614174000",
    "url": "https://github.com/owner/repo/blob/main/myst.yml",
    "userId": 12345,
    "status": "processing",
    "message": "Processing repo link...",
    "parsedDocument": {
      "title": "My Research Project",
      "description": "A comprehensive study...",
      "authors": [
        {
          "name": "Dr. Jane Smith",
          "email": "jane@example.com",
          "affiliation": "University of Science",
          "orcid": "0000-0001-2345-6789"
        }
      ]
    }
  }
}
```

**Response (Completed):**

```json
{
  "data": {
    "uuid": "123e4567-e89b-12d3-a456-426614174000",
    "url": "https://github.com/owner/repo/blob/main/myst.yml",
    "userId": 12345,
    "status": "completed",
    "message": "Import finished successfully",
    "parsedDocument": {...},
    "value": {
      "tree": [
        {
          "name": "root",
          "path": "/",
          "cid": "QmX...",
          "componentType": "folder",
          "contains": [
            {
              "name": "research-paper.pdf",
              "path": "/research-paper.pdf",
              "cid": "QmY...",
              "componentType": "pdf"
            }
          ]
        }
      ]
    }
  }
}
```

### 3. Cancel Job (if needed)

```bash
curl -X POST "https://nodes-api.desci.com/v1/nodes/123e4567-e89b-12d3-a456-426614174000/github-myst-import/myst-import-abc123/cancel" \
  -H "Authorization: Bearer <your-token>"
```

## Integration Examples

### JavaScript/Node.js

```javascript
class MystImportClient {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async initiateImport(nodeUuid, githubUrl, dryRun = false) {
    const response = await fetch(`${this.baseUrl}/v1/nodes/${nodeUuid}/github-myst-import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: githubUrl,
        dryRun,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async getJobStatus(nodeUuid, jobId) {
    const response = await fetch(`${this.baseUrl}/v1/nodes/${nodeUuid}/github-myst-import/${jobId}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async cancelJob(nodeUuid, jobId) {
    const response = await fetch(`${this.baseUrl}/v1/nodes/${nodeUuid}/github-myst-import/${jobId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async waitForCompletion(nodeUuid, jobId, pollInterval = 2000) {
    while (true) {
      const result = await this.getJobStatus(nodeUuid, jobId);
      const status = result.data.status;

      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return result;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }
}

// Usage
const client = new MystImportClient('https://nodes-api.desci.com', 'your-token');

// Initiate import
const result = await client.initiateImport(
  '123e4567-e89b-12d3-a456-426614174000',
  'https://github.com/owner/repo/blob/main/myst.yml',
);

console.log('Job ID:', result.data.jobId);

// Wait for completion
const finalResult = await client.waitForCompletion('123e4567-e89b-12d3-a456-426614174000', result.data.jobId);

console.log('Final status:', finalResult.data.status);
```

### Python

```python
import requests
import time
from typing import Dict, Any

class MystImportClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def initiate_import(self, node_uuid: str, github_url: str, dry_run: bool = False) -> Dict[str, Any]:
        response = requests.post(
            f'{self.base_url}/v1/nodes/{node_uuid}/github-myst-import',
            headers=self.headers,
            json={
                'url': github_url,
                'dryRun': dry_run
            }
        )
        response.raise_for_status()
        return response.json()

    def get_job_status(self, node_uuid: str, job_id: str) -> Dict[str, Any]:
        response = requests.get(
            f'{self.base_url}/v1/nodes/{node_uuid}/github-myst-import/{job_id}',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

    def cancel_job(self, node_uuid: str, job_id: str) -> Dict[str, Any]:
        response = requests.post(
            f'{self.base_url}/v1/nodes/{node_uuid}/github-myst-import/{job_id}/cancel',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

    def wait_for_completion(self, node_uuid: str, job_id: str, poll_interval: int = 2) -> Dict[str, Any]:
        while True:
            result = self.get_job_status(node_uuid, job_id)
            status = result['data']['status']

            if status in ['completed', 'failed', 'cancelled']:
                return result

            time.sleep(poll_interval)

# Usage
client = MystImportClient('https://nodes-api.desci.com', 'your-token')

# Initiate import
result = client.initiate_import(
    '123e4567-e89b-12d3-a456-426614174000',
    'https://github.com/owner/repo/blob/main/myst.yml'
)

print(f"Job ID: {result['data']['jobId']}")

# Wait for completion
final_result = client.wait_for_completion(
    '123e4567-e89b-12d3-a456-426614174000',
    result['data']['jobId']
)

print(f"Final status: {final_result['data']['status']}")
```

## Rate Limiting

The API may implement rate limiting to ensure fair usage. Please refer to the response headers for rate limit information.

## Caching

Job status information is cached for improved performance. The cache TTL (Time To Live) is set to a default value, and subsequent requests for the same job will be served from cache.

## Related Documentation

- [DeSci Nodes Platform](https://nodes.desci.com)
- [MyST Documentation](https://myst.tools/)
- [OpenAPI Specification - Development](http://localhost:5420/documentation)
- [OpenAPI Specification - Staging](https://nodes-api-dev.desci.com/documentation)
- [OpenAPI Specification - Production](https://nodes-api.desci.com/documentation)

## Support

For questions or issues with the MyST GitHub Import API, please contact the DeSci Labs team or create an issue in the project repository.
