# Reverse Proxy Service
Allows mapping paths to other URLs, useful for hiding target services. In particular, where the target URL contains authentication information which might otherwise leak.

## Configuration
Set one or more environment variables matching this pattern, where `EXAMPLE` is the path that will redirect to the target URL:

```shell
PROXY_MAPPING_EXAMPLE=https://example.com
```

So, in general, the pattern is `PROXY_MAPPING_[redirect key]=[redirect target]`. The redirect key is removed from the request, but the rest stays. Here are some examples of that that means in practice:

| Path            | Resolves to              |
|-----------------|--------------------------|
| `/example`      | https://example.com      |
| `/example/cats` | https://example.com/cats |

## Running
Run in development mode:
```shell
PROXY_MAPPING_EXAMPLE=https://example.com npm run dev
```

Run in docker:
```shell
docker build . -t proxy-service
docker run --network=host -e PROXY_MAPPING_EXAMPLE="https://example.com" proxy-service
```

Regardless of which mode, the service listens on port 5555. It can be tested by sending a request:
```shell
curl http://localhost:5555/example
```
