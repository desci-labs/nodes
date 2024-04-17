import express from 'express';
import { ServerResponse } from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';

const SENSIBLE_KEY_REGEX = '^\/[a-zA-Z0-9_-]+';
const rSensibleKey = RegExp(SENSIBLE_KEY_REGEX);

type Mapping = Record<string, string>;

const mapping: Mapping = Object.fromEntries(
  Object.entries(process.env as { [s:string]: string } )
  .filter(([k, _]) => k.startsWith("PROXY_MAPPING_"))
  .map(([k, v]) => [k.replace("PROXY_MAPPING_", ""), v])
  .map(([k, v]) => ["/" + k.toLowerCase(), v])
);

console.log(
  "Raw mapping configuration loaded:\n",
  JSON.stringify(mapping, undefined, 2)
);

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
  on: {
    error: (_err, _req, res) => {
      if (res instanceof ServerResponse) {
        res.writeHead(500, {
          'Content-Type': 'text/plain',
        });
        res.end('Something went wrong while proxying the request');
      };
    },
  }
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
    return res.status(404).json(`No route found for ${req.url}`)
  }
);

app.listen(5678);
