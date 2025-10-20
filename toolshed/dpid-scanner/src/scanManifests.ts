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

// Process a single dPID entry with all its manifests in parallel
const processDpidEntry = async (entry: any) => {
  console.error(`Scanning dPID ${entry.dpid}...`);
  const { dpid, owner, source } = entry;

  // Process all manifests for this dPID in parallel
  const manifestPromises = entry.versions.map(async (version: any) => {
    try {
      const headRes = await fetch(IPFS_GW + version.cid, { method: "head" });
      return {
        cid: version.cid,
        time: new Date(parseInt(version.time) * 1000).toISOString(),
        status: headRes.status,
      };
    } catch (error) {
      console.error(`Error fetching manifest ${version.cid}:`, error);
      return {
        cid: version.cid,
        time: new Date(parseInt(version.time) * 1000).toISOString(),
        status: -1, // Error status
      };
    }
  });

  const manifests = await Promise.all(manifestPromises);

  return {
    dpid,
    owner,
    source,
    manifests,
  };
};

const scanObjects = async (env: Env) => {
  const resolverBaseUrl = envToResolverApiUrl(env);

  let url = resolverBaseUrl + "/query/dpids?history=true&size=50&sort=asc";
  const result: ScanResult = [];

  // Fetch and process first page
  let response = await fetch(url);
  if (!response.ok) {
    console.error(`Failed to fetch ${url}, exiting...`);
    process.exit(1);
  }

  let currentPageData = await response.json();
  let nextPagePromise: Promise<Response> | null = null;

  while (true) {
    // Start fetching next page while processing current page
    if (currentPageData.pagination.hasNext) {
      // next URL drop the sort param
      const nextUrl = currentPageData.pagination.links.next + "&sort=asc";
      nextPagePromise = fetch(nextUrl);
    } else {
      nextPagePromise = null;
    }

    // Process all dPIDs on current page in parallel (max 20 per page)
    const pagePromises = currentPageData.dpids.map((entry: any) =>
      processDpidEntry(entry),
    );
    const pageResults = await Promise.all(pagePromises);
    result.push(...pageResults);

    // Check if there's a next page to process
    if (!nextPagePromise) {
      console.error("No next page; stopping scan...");
      break;
    }

    // Wait for next page to be ready
    response = await nextPagePromise;
    if (!response.ok) {
      console.error(`Failed to fetch next page, exiting...`);
      process.exit(1);
    }

    currentPageData = await response.json();
  }

  return result;
};

const envArg = process.env.DPID_ENV;
if (!envArg || !(envArg === "dev" || envArg === "prod")) {
  console.error("missing envvar DPID_ENV! Set to dev or prod. Exiting...");
  process.exit(1);
}

scanObjects(envArg)
  .then((result) => {
    console.log(JSON.stringify(result, undefined, 2));
  })
  .catch((error) => {
    console.error("Error scanning objects:", error);
    process.exit(1);
  });
