import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import axios, { AxiosError } from 'axios';
import { sleep } from './utils.js';

const NODES_API_TOKEN = process.env.NODES_API_TOKEN;
const JOURNAL_ID = process.env.JOURNAL_ID;
const EDITOR_ID = process.env.EDITOR_ID;
const USER_ID = Number(process.env.USER_ID);

if (!USER_ID || !NODES_API_TOKEN || !JOURNAL_ID || !EDITOR_ID) {
  console.error('Missing required env vars: NODES_API_TOKEN, JOURNAL_EDITOR_API_TOKEN, JOURNAL_ID');
  process.exit(1);
}

const API_BASE = 'https://nodes-api-dev.desci.com/v1';

const INPUT_FILE = 'existingNodes_dev.json';
const OUTPUT_FILE = 'submissionStatus_dev.json';

interface NodeEntry {
  uuid: string;
  dpid: number;
  submissionId?: number;
  editorAssigned?: boolean;
  refereeInvitationToken?: string;
  refereeAccepted?: boolean;
  accepted?: boolean;
}

type StateFile = Record<string, NodeEntry>;

let state: StateFile = {};

async function writeState() {
  await writeFile(OUTPUT_FILE, JSON.stringify(state, null, 2));
  console.log(`State written to ${OUTPUT_FILE}`);
}

function setupExitHandlers() {
  const handler = async (signal: string) => {
    console.log(`\nReceived ${signal}, writing state...`);
    await writeState();
    process.exit(0);
  };

  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    await writeState();
    process.exit(1);
  });
  process.on('unhandledRejection', async (err) => {
    console.error('Unhandled rejection:', err);
    await writeState();
    process.exit(1);
  });
}

async function retryOn502<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 502 && attempt < retries) {
        console.log(`  502 error, retrying (${attempt}/${retries})...`);
        await new Promise((r) => setTimeout(r, delayMs * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

type SubmissionResponse = { ok: true, data: { submissionId: number }, message?: unknown };

/** 1. Node is submitted to the journal
* @returns submissionId string
*/
async function submitNode(dpid: number): Promise<number> {
  const url = `${API_BASE}/journals/${JOURNAL_ID}/submissions`;
  const response = await retryOn502(() =>
    axios.post<SubmissionResponse>(
      url,
      { dpid, version: 1 },
      { headers: { "api-key": NODES_API_TOKEN } }
    )
  );
  const submissionId = response.data.data.submissionId;
  if (!submissionId) {
    throw new Error(`Submit failed: dpid=${dpid}, status=${response.status}, message=${response.data.message}`);
  }
  return submissionId;
}

type AssignResponse = { ok: true, data: { status: string }, message?: unknown };

/** 2. Self-assign as submission editor
* @returns submission status
*/
async function selfAssignSubmissionEditor(submissionId: number): Promise<void> {
  const url = `${API_BASE}/journals/${JOURNAL_ID}/submissions/${submissionId}/assign`;
  const response = await retryOn502(() =>
    axios.post<AssignResponse>(
      url,
      { editorId: USER_ID }, // backend throws on fkey Submission.assignedEditorId => User.id
      { headers: { "api-key": NODES_API_TOKEN } }
    )
  );
  if (response.status !== 200) {
    throw new Error(`Editor assignment failed: status=${response.status}, message=${response.data.message}`);
  }
}

type RefereeInviteBody = {
  refereeName: string,
  // refereeEmail: string, // XOR with refereeUserId
  refereeUserId: number,
  relativeDueDateHrs: number, // >1
  inviteExpiryHours: number, // >1
  expectedFormTemplateIds: [] // empty ok
};

type RefereeInviteResponse = { ok: true, data: { invite: { token: string }}, message?: unknown };

/** 3. Self-invite as submission referee
* @returns invite accept token
*/
async function selfInviteSubmissionReferee(submissionId: number, ): Promise<string> {
  const url = `${API_BASE}/journals/${JOURNAL_ID}/submissions/${submissionId}/referee/invite`;
  const body: RefereeInviteBody = {
    refereeName: "Insight Journal Importer",
    refereeUserId: USER_ID,
    relativeDueDateHrs: 72,
    inviteExpiryHours: 72,
    expectedFormTemplateIds: [],
  };
  const response = await retryOn502(() =>
    axios.post<RefereeInviteResponse>(
      url,
      body,
      { headers: { "api-key": NODES_API_TOKEN } }
    )
  );
  const inviteToken = response.data.data.invite.token;
  if (!inviteToken) {
    throw new Error(`Referee inv failed: status=${response.status}, message=${response.data.message}`);
  }
  return inviteToken;
}

type RefereeAcceptBody = {
  token: string,
  decision: "accept",
};

/** 4. Accept referee invitation */
async function acceptRefereeInvitation(submissionId: number, token: string): Promise<void> {
  const url = `${API_BASE}/journals/${JOURNAL_ID}/submissions/${submissionId}/referee/invite/decision`;
  const body: RefereeAcceptBody = { token, decision: "accept" };
  const response = await retryOn502(() =>
    axios.post(
      url,
      body,
      { headers: { "api-key": NODES_API_TOKEN } }
    )
  );
  if (response.status !== 200) {
    throw new Error(
      `Accept ref failed: status=${response.status}, message=${response.data.message}`
    );
  }
}

/** 5. Accept submission */
async function acceptSubmission(submissionId: number): Promise<void> {
  const url = `${API_BASE}/journals/${JOURNAL_ID}/submissions/${submissionId}/accept`;
  const response = await retryOn502(() =>
    axios.post(url, {}, {
      headers: { "api-key": NODES_API_TOKEN },
    })
  );

  if (response.status !== 200) {
    throw new Error(
      `Accept sub failed: status=${response.status}, message=${response.data.message}`
    );
  }
}

async function loadState(): Promise<StateFile> {
  // Check for existing progress file first
  if (existsSync(OUTPUT_FILE)) {
    console.log(`Resuming from ${OUTPUT_FILE}`);
    const content = await readFile(OUTPUT_FILE, 'utf8');
    return JSON.parse(content);
  }

  // Otherwise load from input file
  console.log(`Starting fresh from ${INPUT_FILE}`);
  const content = await readFile(INPUT_FILE, 'utf8');
  return JSON.parse(content);
}

async function main() {
  setupExitHandlers();

  state = await loadState();

  const entries = Object.entries(state);
  const total = entries.length;
  let processed = 0;

  for (const [_key, entry] of entries) {
    processed++;
    const prefix = `[${processed}/${total}] dpid=${entry.dpid}`;

    // Skip if already accepted
    if (entry.accepted) {
      console.log(`${prefix} - already accepted, skipping`);
      continue;
    }

    try {
      // Submit if no submissionId yet
      if (!entry.submissionId) {
        console.log(`${prefix} - submitting...`);
        const submissionId = await submitNode(entry.dpid);
        entry.submissionId = submissionId;
        console.log(`${prefix} - got submissionId=${submissionId}`);
      } else {
        console.log(`${prefix} - already has submissionId=${entry.submissionId}`);
      }

      if (!entry.editorAssigned) {
        console.log(`${prefix} - self-assigning as submission editor...`);
        await selfAssignSubmissionEditor(entry.submissionId);
        entry.editorAssigned = true;
      } else {
        console.log(`${prefix} - editor already assigned`);
      }

      if (!entry.refereeInvitationToken) {
        console.log(`${prefix} - self-inviting as submission referee...`);
        const token = await selfInviteSubmissionReferee(entry.submissionId);
        entry.refereeInvitationToken = token;
        console.log(`${prefix} - got refereeInvitationToken=${token}`);
      } else {
        console.log(`${prefix} - referee already invited`);
      }

      if (!entry.refereeAccepted) {
        console.log(`${prefix} - accepting submission referee invite...`);
        await acceptRefereeInvitation(entry.submissionId, entry.refereeInvitationToken);
        entry.refereeAccepted = true;
      } else {
        console.log(`${prefix} - referee invite already accepted`);
      }

      if (!entry.accepted) {
        console.log(`${prefix} - accepting submission...`);
        await acceptSubmission(entry.submissionId);
        entry.accepted = true;
        console.log(`${prefix} - accepted!`);
      } else {
        console.log(`${prefix} - submission already accepted`);
      }
    } catch (err) {
      const axiosErr = err as AxiosError;
      console.error(
        `${prefix} - ERROR:`,
        axiosErr.response?.data || axiosErr.message
      );
      // Continue to next entry, state will be saved on exit
    }
  }

  console.log('\nAll entries processed');
  await writeState();
}

main();
