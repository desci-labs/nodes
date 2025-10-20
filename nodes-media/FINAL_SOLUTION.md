# Final Worker Thread Solution

## The Challenge

Worker threads in Node.js cannot execute TypeScript files directly, even with `tsx`. This caused `ERR_UNKNOWN_FILE_EXTENSION` errors in development mode.

## The Solution

**Pre-compile the worker to JavaScript, even in development mode.**

### How It Works

#### Development Mode (docker-compose)

1. Container starts and runs `scripts/nodes-media-dev.sh`
2. Script compiles `src/workers/mystBuildWorker.ts` → `src/workers/mystBuildWorker.js`
3. Main server runs with `tsx` from `src/`
4. Controller loads `../../workers/mystBuildWorker.js` (compiled version)
5. Worker executes successfully as JavaScript

#### Production Mode (Dockerfile)

1. Build step runs `npm run build` (compiles everything to `dist/`)
2. Server runs from `dist/`
3. Controller loads `../../workers/mystBuildWorker.js` from `dist/workers/`
4. Worker executes successfully

### Files Changed

#### 1. `src/controllers/services/buildAndExportsJournalFiles.ts`

**Simplified to always use `.js`:**

```typescript
// ALWAYS use .js extension (worker must be pre-compiled even in dev)
const workerPath = new URL('../../workers/mystBuildWorker.js', import.meta.url);

const worker = new Worker(workerPath, {
  workerData: {
    /* ... */
  },
});
```

**Why this works:**

- In dev: Loads `src/workers/mystBuildWorker.js` (pre-compiled by startup script)
- In prod: Loads `dist/workers/mystBuildWorker.js` (compiled by build step)

#### 2. `scripts/nodes-media-dev.sh`

**Added compilation step:**

```bash
#!/bin/sh
cd /app

# Compile worker threads (they can't run as TypeScript in worker threads)
echo "Compiling worker to JavaScript..."
mkdir -p src/workers
npx tsc src/workers/mystBuildWorker.ts \
  --outDir src/workers \
  --module nodenext \
  --moduleResolution nodenext \
  --target es2022 \
  --esModuleInterop \
  --skipLibCheck \
  --declaration false

# Start the dev server with tsx
npm run dev
```

#### 3. `.gitignore`

**Ignore compiled worker files:**

```
# Compiled worker (generated in dev mode)
src/workers/*.js
src/workers/*.js.map
```

## Why This Approach?

### Attempted Solutions That Didn't Work

| Attempt                    | Issue                                  |
| -------------------------- | -------------------------------------- |
| Auto-detect `.ts` vs `.js` | Worker threads can't load `.ts` files  |
| Pass `execArgv` to worker  | tsx loaders don't propagate to workers |
| Use tsx register API       | Doesn't work within worker context     |
| JavaScript wrapper/loader  | Too complex, maintenance burden        |

### Why Pre-compilation Works

✅ **Simple**: One-time compilation at startup  
✅ **Reliable**: JavaScript always works in workers  
✅ **Fast**: No runtime TypeScript overhead  
✅ **Universal**: Works in dev and prod  
✅ **Maintainable**: Single source of truth (`.ts` file)

## Testing

### 1. Restart Docker Container

```bash
cd /Users/tayo/workstation/Desci-labs/projects/nodes
docker-compose -f docker-compose.media.yml down
docker-compose -f docker-compose.media.yml up --build
```

### 2. Watch for Compilation Log

You should see:

```
Compiling worker to JavaScript...
```

### 3. Submit Test Job

Use your existing endpoint.

### 4. Check Logs

**Should see:**

```
✅ MYST::Spawning worker: { workerPath: "file:///app/src/workers/mystBuildWorker.js" }
✅ MYST::Worker completed successfully
```

**Should NOT see:**

```
❌ ERR_UNKNOWN_FILE_EXTENSION
❌ ERR_MODULE_NOT_FOUND
```

## File Structure

### Development Mode

```
src/
├── controllers/
│   └── services/
│       └── buildAndExportsJournalFiles.ts (runs with tsx)
└── workers/
    ├── mystBuildWorker.ts (source)
    └── mystBuildWorker.js (compiled at startup, gitignored)
```

### Production Mode

```
dist/
├── controllers/
│   └── services/
│       └── buildAndExportsJournalFiles.js (compiled)
└── workers/
    └── mystBuildWorker.js (compiled by build)
```

## Benefits

### For Development

- ✅ Workers function properly
- ✅ Fast startup (single file compilation)
- ✅ Hot reload still works for main code
- ✅ No manual build step needed

### For Production

- ✅ No changes needed
- ✅ Standard build process
- ✅ Optimal performance

## Troubleshooting

### Issue: Worker file not found in dev

**Check:**

```bash
docker exec -it nodes_media ls -la /app/src/workers/
```

**Should see:**

```
mystBuildWorker.ts
mystBuildWorker.js  # <-- This should exist
```

**If missing:**

1. Check if compilation step ran (look for "Compiling worker" in logs)
2. Check for TypeScript errors in the worker file
3. Restart the container

### Issue: Worker compilation fails

**Check logs for TypeScript errors:**

```bash
docker-compose -f docker-compose.media.yml logs nodes_media | grep -A 10 "Compiling worker"
```

**Common causes:**

- Missing dependencies in worker file
- TypeScript syntax errors
- Import path issues

### Issue: Still getting ERR_MODULE_NOT_FOUND

**Check the resolved path:**

```bash
docker-compose -f docker-compose.media.yml logs nodes_media | grep "workerPath"
```

**Should show:**

- Dev: `file:///app/src/workers/mystBuildWorker.js`
- Prod: `file:///app/dist/workers/mystBuildWorker.js`

## Summary

The final solution pre-compiles the worker to JavaScript before starting the dev server. This is:

- **Simple**: One extra line in startup script
- **Reliable**: JavaScript works everywhere
- **Fast**: Minimal overhead
- **Clean**: No runtime complexity

Worker threads + TypeScript = Always use JavaScript 🎯
