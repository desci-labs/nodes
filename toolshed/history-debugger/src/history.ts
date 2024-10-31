const ONE_WEEK = 7 * 24 * 60 * 60;

export type TokenHistory = {
  id: string;
  owner: string;
  history: {
    v: number;
    time: number;
    cid: string;
  }[];
};

type RawToken = {
  id: string;
  owner: string;
  versions: {
    time: number;
    cid: string;
  }[];
}

const getTokenHistory = async (dpid: number, env: string): Promise<TokenHistory> => {
  const maybeDevPrefix = env === 'dev' ? 'dev-' : '';
  const legacyUrl = `https://${maybeDevPrefix}beta.dpid.org/api/v1/dpid?page=${dpid + 1}&size=1&sort=asc`;
  console.error(`💫 Fetching ${legacyUrl}`);
  const legacyDpidRes = await fetch(legacyUrl);
  const legacyDpid = await legacyDpidRes.json();

  const researchObject = legacyDpid[0].researchObject as RawToken;
  const history = researchObject.versions.map((event, i) => ({
    v: i,
    time: event.time,
    cid: event.cid,
  }));

  return {
    id: researchObject.id,
    owner: researchObject.owner,
    history,
  };
}

export type StreamHistory = {
  id: string;
  owner: string;
  history: {
    v: number;
    commit: string;
    cid: string;
    time: number;
    anchor: number;
  }[];
}

type RawStream = {
  state: {
    log: {
      type: number;
      expirationTime: number;
      timestamp: number;
    }[];
  };
}

type IndexedStream = {
  owner: string;
  versions: {
    version: string;
    time: number;
    manifest: string;
  }[];
}

const getStreamHistory = async (streamId: string, env: string): Promise<StreamHistory> => {
  // We can compute actual signature time from the raw commits
  const streamApiUrl = `https://ceramic-${env}.desci.com/api/v0/streams/${streamId}`;
  console.error(`💫 Fetching ${streamApiUrl}`);
  const rawStreamReq = await fetch(streamApiUrl);
  const rawStream = await rawStreamReq.json() as RawStream;

  const rawUserCommits = rawStream.state.log
    .filter(event => event.type !== 2);

  const maybeDevPrefix = env === 'dev' ? 'dev-' : '';
  // But we can get the manifest CID more easily from the resolver
  const resolverUrl = `https://${maybeDevPrefix}beta.dpid.org/api/v2/resolve/codex/${streamId}`
  const streamQueryRes = await fetch(resolverUrl);
  const streamQuery = await streamQueryRes.json() as IndexedStream;

  const owner = streamQuery.owner as string;
  const history = streamQuery.versions.map((event, i) => ({
    v: i,
    commit: event.version,
    cid: event.manifest,
    time: rawUserCommits.at(i)!.expirationTime - ONE_WEEK,
    anchor: rawUserCommits.at(i)!.timestamp,
  }));
  return { id: streamId, owner, history };
}

export type GenericEvent =
  | StreamHistory['history'][number]
  | TokenHistory['history'][number];

export type AllEvents = {
  token: TokenHistory;
  stream: StreamHistory;
  merged: GenericEvent[];
};

export const getAllEvents = async (dpid: number, streamId: string, env: string): Promise<AllEvents> => {
  console.error('🔎 Getting events for token and stream history', { dpid, streamId });

  const token = await getTokenHistory(dpid, env);
  const stream = await getStreamHistory(streamId, env);

  const merged = [...token.history, ...stream.history]
    .sort((a, b) => a.time - b.time);

  return {
    token,
    stream,
    merged,
  };
}
