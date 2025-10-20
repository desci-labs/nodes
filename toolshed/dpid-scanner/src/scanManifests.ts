type Env = "dev" | "prod";

const IPFS_GW = "https://ipfs.desci.com/ipfs/";

const envToResolverApiUrl = (env: Env) => {
  switch (env) {
    case "dev":
      return "https://dev-beta.dpid.org/api/v2";
    case "prod":
      return "https://beta.dpid.org/api/v2";
  }
};

type ManifestStatus = {
  cid: string;
  time: string;
  status: number;
};

type ScanResult = {
  dpid: number;
  owner: string;
  source: "legacy" | "ceramic";
  manifests: ManifestStatus[];
}[];

const scanObjects = async (env: Env) => {
  const resolverBaseUrl = envToResolverApiUrl(env);

  let shouldContinue = true;
  let url = resolverBaseUrl + "/query/dpids?history=true&sort=asc";

  const result: ScanResult = [];
  while (shouldContinue) {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch ${url}, exiting...`);
      process.exit(1);
    }

    const data = await response.json();
    for (const entry of data.dpids) {
      console.error(`Scanning dPID ${entry.dpid}...`);
      const { dpid, owner, source } = entry;
      const manifests: ManifestStatus[] = [];
      for (const version of entry.versions) {
        const headRes = await fetch(IPFS_GW + version.cid, { method: "head" });
        manifests.push({
          cid: version.cid,
          time: new Date(parseInt(version.time) * 1000).toISOString(),
          status: headRes.status,
        });
      }
      result.push({
        dpid,
        owner,
        source,
        manifests,
      });
    }

    if (data.pagination.hasNext) {
      // sort param not kept in pagination url
      url = data.pagination.links.next + "&sort=asc";
    } else {
      console.error("No next page; stopping scan...");
      shouldContinue = false;
    }
  }

  return result;
};

const envArg = process.env.DPID_ENV;
if (!envArg || !(envArg === "dev" || envArg === "prod")) {
  console.error("missing envvar DPID_ENV! Set to dev or prod. Exiting...");
  process.exit(1);
}

const result = await scanObjects(envArg);

console.log(JSON.stringify(result, undefined, 2));
