import express from 'express';
import { ServerResponse } from 'http';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { buildMappingFromEnv, getSensitiveStrings, redactSensitive } from './util.js';

const SENSIBLE_KEY_REGEX = '^\/[a-zA-Z0-9_-]+';
const rSensibleKey = RegExp(SENSIBLE_KEY_REGEX);

const mapping = buildMappingFromEnv();

console.log(
  "Raw mapping configuration loaded:\n",
  JSON.stringify(mapping, undefined, 2)
);

const sensitiveStrings = getSensitiveStrings(mapping);

/** 
 * Checks that a single mapping has a sensible key and that the
 * target is a valid URL.
*/
const assertValidMapping = (
  [key, target]: [string, string]
): void => {
  if (!rSensibleKey.test(key)) {
    throw new Error(`Invalid mapping key: ${key}`);
  };
  
  try {
    new URL(target);
  } catch {
    throw new Error(`Invalid URL in target: ${target}`);
  };
};

console.log("Asserting valid keys and targets...")
Object.entries(mapping).forEach(assertValidMapping);
console.log("All good. Starting proxy...")

const createProxy = (target: string) => createProxyMiddleware({
  target,
  // Enables successful TLS handshake
  changeOrigin: true,
  // Cut the key so it doesn't get applied to target URL
  pathRewrite: { [SENSIBLE_KEY_REGEX]: "" },
  // Log each proxy call to console
  logger: console,
  // Disable automatically sending response, handled by responseInterceptor
  selfHandleResponse: true,
  on: {
    error: (_err, _req, res) => (res as ServerResponse)
      .writeHead(500, { 'Content-Type': 'text/plain' })
      .end('Something went wrong while proxying the request'),
    proxyRes: responseInterceptor(
      async (responseBuffer, proxyRes, _req, res) => {
        res.statusCode = proxyRes.statusCode ?? 200;
        return redactSensitive(
          sensitiveStrings,
          responseBuffer.toString("utf8")
        );
      }),
    },
});

const app = express();

Object.entries(mapping)
  .forEach(([alias, target]) => app.use(alias, createProxy(target)));

app.use("/healthcheck", (_req, res) => {
  res.send("I'm doing OK");
});

app.use(
  (req, res) => {
    console.log(`Got request for unmapped path ${req.url}, responding 404.`);
    res.writeHead(404, `No route found for ${req.url}`).end();
  },
);

app.listen(5678);
