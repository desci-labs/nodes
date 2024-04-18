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


## Washing responses
Some targets (looking at you, Alchemy) return the URL secrets in the response body. Since this is target-dependent, you need to add detection code in `getSensitiveStrings` if this applies to a new proxy target.

The request interceptor automatically washes all response bodies that goes back to the client by replacing instances of all these sensitive strings with `[redacted]`.

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

Regardless of which mode, the service listens on port 5678. It can be tested by sending a request:
```shell
curl http://localhost:5678/example
```
