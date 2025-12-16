# Journal Submission Import

The `submitAndAccept` script automates submitting existing nodes to a journal and accepting them through the editorial workflow.

## What it does

For each node in the input file, the script performs these steps:

1. **Submit** - Creates a journal submission (`POST /journals/:id/submissions`)
2. **Assign Editor** - Self-assigns as submission editor (`POST /journals/:id/submissions/:subId/assign`)
3. **Invite Referee** - Self-invites as referee (`POST /journals/:id/submissions/:subId/referee/invite`)
4. **Accept Invite** - Accepts the referee invitation (`POST /journals/:id/submissions/:subId/referee/invite/decision`)
5. **Accept Submission** - Accepts the submission (`POST /journals/:id/submissions/:subId/accept`)

## Resume on failure

The script is idempotent and tracks progress in a status file (`submissionStatus_dev.json`). Each step completion is recorded, so:

- On restart, completed steps are skipped
- On SIGINT/SIGTERM, current state is written before exit
- On errors, processing continues to the next node

## Configuration

Required environment variables in `.env`:

| Variable | Description |
|----------|-------------|
| `NODES_API_TOKEN` | API token from user profile |
| `USER_ID` | ID of the user (must have CHIEF_EDITOR role) |
| `JOURNAL_ID` | Target journal ID |

## Usage

```bash
npx tsx src/submitAndAccept.ts
```

Input: `existingNodes_dev.json` - nodes with `uuid` and `dpid`
Output: `submissionStatus_dev.json` - nodes with submission progress state
