export type Mapping = Record<string, string>;

/**
 * Build a route mapping from envvars prefixed `PROXY_MAPPING_`
*/
export const buildMappingFromEnv = (): Mapping => Object.fromEntries(
  Object.entries(process.env as { [s:string]: string } )
  .filter(([k, _]) => k.startsWith("PROXY_MAPPING_"))
  .map(([k, v]) => [k.replace("PROXY_MAPPING_", ""), v])
  .map(([k, v]) => ["/" + k.toLowerCase(), v])
);

/**
 * Find sensitive strings in mapped URL's
*/
export const getSensitiveStrings = (mapping: Mapping) => {
  const urls = Object.values(mapping);

  const alchemyTokens = urls
    .filter(url => url.includes("alchemy.com"))
    /* 32-char alphanum token with dashes and underscores */
    .map(url => url.match(/[a-zA-Z0-9_-]{32}/))
    /* Remove potential null match for tokenless url */
    .flatMap(maybeMatch => maybeMatch ? [maybeMatch] : [])
    /* Get the match from RexExpMatchArray */
    .map(matchArr => matchArr[0]);

  return alchemyTokens;
};

export const redactSensitive = (
  sensitiveStrings: string[],
  dirty: string
): string =>
  sensitiveStrings.reduce(
    (acc, nextSecret) => acc.replaceAll(nextSecret, "[redacted]"),
    dirty, // initial accumulator
  );
