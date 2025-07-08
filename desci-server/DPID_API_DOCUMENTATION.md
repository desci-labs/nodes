# DPID Metadata API Documentation

## Overview

The DPID (Decentralized Persistent Identifier) Metadata API provides access to comprehensive metadata for research objects published on the DeSci Nodes platform. This API allows you to retrieve structured information about research publications including titles, abstracts, authors, DOIs, publication years, and PDF access URLs.

## Base URL

The API is available at the following endpoints:

- **Development**: `http://localhost:5420`
- **Staging**: `https://nodes-api-dev.desci.com`
- **Production**: `https://nodes-api.desci.com`

## Endpoints

### GET /v1/dpid/{dpid}

Retrieves metadata for a research object by its DPID.

#### Path Parameters

| Parameter | Type   | Required | Description                                                                       |
| --------- | ------ | -------- | --------------------------------------------------------------------------------- |
| `dpid`    | number | Yes      | The DPID (Decentralized Persistent Identifier) of the research object to retrieve |

#### Query Parameters

| Parameter | Type   | Required | Description                                                                                       |
| --------- | ------ | -------- | ------------------------------------------------------------------------------------------------- |
| `version` | number | No       | Version of the research object metadata to retrieve. If not specified, returns the latest version |

#### Request Example

```bash
# Get latest version metadata
curl -X GET "https://nodes-api.desci.com/v1/dpid/12345"

# Get specific version metadata
curl -X GET "https://nodes-api.desci.com/v1/dpid/12345?version=2"
```

#### Response Schema

```json
{
  "data": {
    "title": "string",
    "abstract": "string",
    "authors": [
      {
        "id": "string (optional)",
        "name": "string",
        "orcid": "string (optional)",
        "googleScholar": "string (optional)",
        "role": "string | string[] | enum | enum[]",
        "organizations": [
          {
            "id": "string",
            "name": "string",
            "subtext": "string (optional)"
          }
        ],
        "github": "string (optional)",
        "nodesUserId": "number (optional)"
      }
    ],
    "doi": "string (optional)",
    "publicationYear": "number (optional)",
    "pdfUrl": "string"
  }
}
```

#### Response Fields

| Field             | Type              | Description                                            |
| ----------------- | ----------------- | ------------------------------------------------------ |
| `title`           | string            | Title of the research object                           |
| `abstract`        | string            | Abstract/description of the research object            |
| `authors`         | array             | List of authors/contributors with detailed information |
| `doi`             | string (optional) | DOI associated with the research object                |
| `publicationYear` | number (optional) | Year of publication                                    |
| `pdfUrl`          | string            | URL to access the PDF version of the research object   |

#### Author Object Fields

| Field           | Type              | Description                                                                          |
| --------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `id`            | string (optional) | Random UUID to identify the contributor                                              |
| `name`          | string            | Name of the contributor                                                              |
| `orcid`         | string (optional) | Orcid handle of the contributor                                                      |
| `googleScholar` | string (optional) | Google Scholar profile of the contributor                                            |
| `role`          | string/array      | Type of role in the publication. Can be: "Author", "Node Steward", or custom strings |
| `organizations` | array (optional)  | Organizations the contributor is affiliated with                                     |
| `github`        | string (optional) | GitHub profile of the contributor                                                    |
| `nodesUserId`   | number (optional) | DeSci Nodes user ID                                                                  |

#### Organization Object Fields

| Field     | Type              | Description                         |
| --------- | ----------------- | ----------------------------------- |
| `id`      | string            | Organization identifier             |
| `name`    | string            | Organization name                   |
| `subtext` | string (optional) | Additional organization information |

#### HTTP Status Codes

| Code | Description                                                  |
| ---- | ------------------------------------------------------------ |
| 200  | Success - DPID metadata retrieved                            |
| 400  | Bad Request - Invalid DPID format or version parameter       |
| 404  | Not Found - DPID not found or no published version available |
| 500  | Internal Server Error - Server error occurred                |

#### Error Response Format

```json
{
  "error": "string"
}
```

## Examples

### Successful Response

```json
{
  "data": {
    "title": "Decentralized Science: A New Paradigm for Research",
    "abstract": "This paper explores the potential of decentralized science platforms to revolutionize how research is conducted, published, and validated.",
    "authors": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Dr. Jane Smith",
        "orcid": "0000-0001-2345-6789",
        "role": "Author",
        "organizations": [
          {
            "id": "org-001",
            "name": "DeSci Labs",
            "subtext": "Research Organization"
          }
        ],
        "github": "janesmith",
        "nodesUserId": 12345
      },
      {
        "name": "Dr. John Doe",
        "orcid": "0000-0002-3456-7890",
        "role": "Node Steward",
        "organizations": [
          {
            "id": "org-002",
            "name": "University of Science",
            "subtext": "Academic Institution"
          }
        ]
      }
    ],
    "doi": "10.1000/123456",
    "publicationYear": 2024,
    "pdfUrl": "https://ipfs.io/ipfs/QmX.../research-paper.pdf"
  }
}
```

### Error Response Examples

```json
// 404 - DPID not found
{
  "error": "No published version found for dpid"
}

// 400 - Invalid version parameter
{
  "error": "Invalid version parameter"
}
```

## Caching

The API implements caching to improve performance. Responses are cached for a default TTL (Time To Live) period. Subsequent requests for the same DPID and version will be served from cache.

## Rate Limiting

The API may implement rate limiting to ensure fair usage. Please refer to the response headers for rate limit information.

## Authentication

This endpoint does not require authentication and is publicly accessible.

## Versioning

The API supports versioning through the optional `version` query parameter:

- **Latest Version**: Omit the `version` parameter or use the highest available version number
- **Specific Version**: Use the `version` parameter to retrieve metadata for a specific version
- **Version Numbering**: Versions are numbered in reverse order (latest = 1, previous = 2, etc.)

## Integration Examples

### JavaScript/Node.js

```javascript
async function getDpidMetadata(dpid, version = null) {
  const url = `https://nodes-api.desci.com/v1/dpid/${dpid}${version ? `?version=${version}` : ''}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error fetching DPID metadata:', error);
    throw error;
  }
}

// Usage
const metadata = await getDpidMetadata(12345);
console.log('Title:', metadata.title);
console.log(
  'Authors:',
  metadata.authors.map((a) => a.name),
);
```

### Python

```python
import requests

def get_dpid_metadata(dpid, version=None):
    url = f"https://nodes-api.desci.com/v1/dpid/{dpid}"
    params = {"version": version} if version else {}

    try:
        response = requests.get(url, params=params)
        response.raise_for_status()

        data = response.json()
        return data["data"]
    except requests.exceptions.RequestException as e:
        print(f"Error fetching DPID metadata: {e}")
        raise

# Usage
metadata = get_dpid_metadata(12345)
print(f"Title: {metadata['title']}")
print(f"Authors: {[author['name'] for author in metadata['authors']]}")
```

### cURL

```bash
# Get latest version
curl -X GET "https://nodes-api.desci.com/v1/dpid/12345" \
  -H "Accept: application/json"

# Get specific version
curl -X GET "https://nodes-api.desci.com/v1/dpid/12345?version=2" \
  -H "Accept: application/json"
```

## Related Documentation

- [DeSci Nodes Platform](https://nodes.desci.com)
- [DPID Registry Documentation](https://dpid.org)
- [OpenAPI Specification](http://localhost:5420/documentation/#/DPID)

## Support

For questions or issues with the DPID Metadata API, please contact the DeSci Labs team or create an issue in the project repository.
