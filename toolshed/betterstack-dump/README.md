# betterstack-dump

Betterstack UI is quite garbage when wanting to postprocess logs, because the download results button only includes the amount that you have manually scrolled through to cache on the page 💀 Sometimes it works better, sometimes worse. Regardless: unreliable.

This helper uses the [Live tail Query API](https://betterstack.com/docs/logs/query-api/v2/live-tail/) to fetch the results.

## Setup

1. Copy the Telemetry API token from [here](https://betterstack.com/settings/api-tokens/129419).
2. Copy `.env.example` to `.env` and set the token var
3. Install deps with `npm ci`

## Usage

The main point of this tool is to fetch a lot of history and subquery it locally, to compute stuff like average request times, data sizes, and similar derived statistics.

You write the base query just like in the betterstack UI. It's fairly powerful, as documented in [Logs Query Language](https://betterstack.com/docs/logs/using-logtail/live-tail-query-language/).

### Configuration
```bash
Usage: npm start -- --query='...' [optional flags]

Flags:
  --query='search query in Live tail Query Language'
  [--order=newest_first] (default: oldest_first)
  [--batch=100]          (default: 1000)
  [--from=ISO8601 date]  (default: to ? to-30m : now-30m)
  [--to=ISO8610 date]    (default: from ? from+30m : now)
  [--max_pages=number]   (default: no limit)
```

The output is (over)written to `logs/${query}_from_${from}_to_${to}.json`.

### Example
To fetch all the logs from a single service between two points in time:
```bash
npm start -- \
  --query='kubernetes.container_name:openalex-importer' \
  --from=2025-01-30T15:00:00 \
  --to=2025-02-03T10:41:00
```

Calculate the mean fetch latency:
```bash
jq '.message | fromjson? | select(.msg == "Saved chunk to database") | .duration' logs/query.json \
  jq --slurp 'add / length'
6932.11431723177
```

or the events with some maximum value:
```bash
jq '.message | fromjson? | select(.msg == "Work readable metrics")' logs/query.json \
  | jq --slurp '{ longestFetchMs: max_by(.fetchMs), maxPages: max_by(.page) }'
{
  "longestFetch": {
    "bufferedPages": 5,
    "fetchMs": 16049,
    "hostname": "openalex-importer-dkn4k",
    "idleMs": 0,
    "level": 30,
    "msg": "Work readable metrics",
    "page": 6155,
    "pid": 1,
    "pushMs": 0,
    "pushWouldAcceptMore": true,
    "time": 1738473878453
  },
  "maxPages": {
    "bufferedPages": 9,
    "fetchMs": 279,
    "hostname": "openalex-importer-dkn4k",
    "idleMs": 1,
    "level": 30,
    "msg": "Work readable metrics",
    "page": 35184,
    "pid": 1,
    "pushMs": 0,
    "pushWouldAcceptMore": true,
    "time": 1738419973441
  }
}
```
