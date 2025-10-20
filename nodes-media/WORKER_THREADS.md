# Worker Threads Implementation for MYST Build Process

## Overview

The MYST repository build and export process has been refactored to use Node.js Worker Threads, offloading CPU and I/O-intensive operations from the main Express server thread.

## What Changed

### Before

- All processing (downloading, building, uploading) ran on the main thread
- Long-running jobs could block other requests
- Multiple concurrent jobs would compete for CPU time on the same thread

### After

- Main thread only handles request validation and worker spawning
- All heavy processing runs in isolated worker threads
- Each job runs independently without blocking the main thread
- Better concurrency and scalability

## Architecture

### Files Structure

```
src/
├── controllers/
│   └── services/
│       └── buildAndExportsJournalFiles.ts  (Simplified controller)
└── workers/
    └── mystBuildWorker.ts                   (All processing logic)
```

### Request Flow

1. **Request arrives** at `POST /v1/services/process-journal-submission`
2. **Controller validates** input and immediately responds with 202 status
3. **Worker thread spawned** with job data
4. **Worker processes** the job:
   - Downloads GitHub repository
   - Extracts and validates files
   - Runs `pixi run build-meca` command
   - Uploads results to desci-server
5. **Status updates** sent to desci-server throughout the process
6. **Worker exits** and cleans up resources

## Key Benefits

### 1. **Non-Blocking**

The main Express server remains responsive even during heavy processing jobs.

### 2. **True Parallelism**

Worker threads can utilize multiple CPU cores for concurrent jobs.

### 3. **Isolation**

Each job runs in isolation. If a worker crashes, it doesn't affect:

- The main server
- Other worker threads
- Subsequent requests

### 4. **Resource Management**

Workers automatically clean up when completed, preventing memory leaks.

## Technical Details

### Worker Communication

The worker uses `parentPort` to send completion/error messages:

```typescript
parentPort?.postMessage({ success: true });
// or
parentPort?.postMessage({ success: false, error: 'Error message' });
```

The controller listens for these messages:

```typescript
worker.on('message', (message) => {
  if (message.success) {
    logger.info({ jobId, uuid }, 'Worker completed successfully');
  } else {
    logger.error({ jobId, uuid, error: message.error }, 'Worker failed');
  }
});
```

### Environment Variables

Both files require these environment variables:

- `INTERNAL_SERVICE_SECRET` - Auth token for desci-server communication
- `DESCI_SERVER_URL` - Base URL for desci-server API

### Child Processes in Workers

The worker spawns the `pixi run build-meca` command as a child process. This is perfectly safe because:

- Child processes run at the OS level, independent of the worker thread
- Native modules used by `pixi` don't depend on the Node.js runtime
- The worker simply orchestrates and monitors the child process

## Building and Running

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

The TypeScript compiler will output:

- `dist/controllers/services/buildAndExportsJournalFiles.js`
- `dist/workers/mystBuildWorker.js`

## Error Handling

### Worker Errors

Caught by the `worker.on('error')` handler and logged.

### Process Errors

The worker catches build process failures and updates job status accordingly.

### Cleanup

Both success and failure paths include cleanup:

- Temporary zip files
- Extracted repository folders
- Build artifacts

## Monitoring

Workers emit three types of events:

1. **`message`** - Job completion status
2. **`error`** - Worker-level errors (rare)
3. **`exit`** - Worker termination with exit code

All events are logged with `jobId` and `uuid` for traceability.

## Testing

To test the worker implementation:

1. Send a POST request to the endpoint:

```bash
curl -X POST http://localhost:5454/v1/services/process-journal-submission \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: your-secret" \
  -d '{
    "url": "https://github.com/owner/repo/blob/main/myst.yml",
    "jobId": "test-job-123",
    "uuid": "test-uuid-456",
    "parsedDocument": {...}
  }'
```

2. Check logs for worker messages:

- Worker spawn confirmation
- Processing status updates
- Completion/error messages

3. Verify the main server remains responsive during processing

## Performance Considerations

### Memory

Each worker has its own V8 heap. Monitor memory usage with concurrent jobs.

### CPU

Workers can utilize multiple cores. Ensure your deployment has adequate CPU resources.

### Concurrency

No hard limit on concurrent workers. Consider implementing a worker pool for high-traffic scenarios.

## Future Enhancements

Potential improvements:

1. **Worker Pool**: Reuse workers instead of spawning new ones
2. **Job Queue**: Add BullMQ or similar for better job management
3. **Progress Events**: Stream progress updates from worker to main thread
4. **Graceful Shutdown**: Ensure workers complete before server shutdown
5. **Resource Limits**: Set memory/CPU limits per worker

## Troubleshooting

### "Cannot find module" errors (ERR_MODULE_NOT_FOUND)

**Problem**: Worker file not found at runtime.

**Solution**: We use `new URL('../../workers/mystBuildWorker.js', import.meta.url)` for proper ES module path resolution. This works in both development and production (Docker).

**Why this works**:

- `import.meta.url` gives the current file's URL
- `new URL()` resolves the relative path correctly in ES modules
- Works with TypeScript compilation and Docker deployment

**Debug**: Check the logged `workerPath` to verify it resolves to `dist/workers/mystBuildWorker.js`.

### Worker never completes

Check desci-server connectivity and INTERNAL_SERVICE_SECRET validity.

### Build process fails

The `pixi` command must be available in the system PATH.

### High memory usage

Monitor concurrent workers and consider implementing a worker pool with limits.
