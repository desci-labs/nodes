require('dotenv').config();
const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const path = require('path');

const DEBUG = true;

// Configuration
const config = {
  closedIndex: 'works_closed_2024_09_04_dedupe_optimized2',
  openIndex: 'works_2024_08_27_dedupe_optimized2',
  batchSize: 10000,
  concurrentBatches: 5, // Number of concurrent delete operations
  fetchAhead: 5, // Increased from 2 to keep queue filled
  fetchConcurrency: 5, // Number of concurrent fetch operations
  checkpointInterval: 10,
  checkpointFile: path.join(__dirname, 'duplicate_removal_checkpoint.json'),
  logFile: path.join(__dirname, 'duplicate_removal.log'),
  maxRetries: 5,
  backoffTimeMs: 30000, // 30 seconds initial backoff
  deleteTaskTimeout: 120000, // 2 minutes timeout for delete tasks
  refreshInterval: 50, // Refresh index every N batches
  deleteWaitForCompletion: false, // Add this to allow async deletions
};

// Initialize ES client with retry logic and SSL disabled
const client = new Client({ 
  node: process.env.ES_HOST,
  auth: {
    apiKey: process.env.ES_API_KEY
  },
  maxRetries: config.maxRetries,
  requestTimeout: 120000,
  sniffOnStart: false,
  ssl: {
    rejectUnauthorized: false
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Debug logging helper
function debugLog(message, data) {
  if (!DEBUG) return;
  log(`DEBUG: ${message}`);
  if (data) {
    try {
      log(`DEBUG DATA: ${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`);
    } catch (e) {
      log(`DEBUG DATA: [Could not stringify: ${e.message}]`);
    }
  }
}

// Setup logging
function log(message, level = 'INFO', highlight = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  if (highlight) {
    console.log(`\x1b[32m${logMessage}\x1b[0m`);
  } else {
    console.log(logMessage);
  }
  fs.appendFileSync(config.logFile, logMessage + '\n');
}

// Load checkpoint if exists
function loadCheckpoint() {
  try {
    if (fs.existsSync(config.checkpointFile)) {
      const data = fs.readFileSync(config.checkpointFile, 'utf8');
      log(`Loading checkpoint file: ${config.checkpointFile}`);
      return JSON.parse(data);
    }
  } catch (error) {
    log(`Error loading checkpoint: ${error.message}`, 'ERROR');
  }
  return null;
}

// Save checkpoint
function saveCheckpoint(checkpoint) {
  try {
    fs.writeFileSync(config.checkpointFile, JSON.stringify(checkpoint, null, 2));
    log(`Checkpoint saved at batch ${checkpoint.batchCount || 0}, total processed: ${checkpoint.totalProcessed || 0}`);
  } catch (error) {
    log(`Error saving checkpoint: ${error.message}`, 'ERROR');
  }
}

// Refresh the index
async function refreshIndex() {
  try {
    await client.indices.refresh({ index: config.openIndex });
    log(`Refreshed index ${config.openIndex}`);
    return true;
  } catch (error) {
    log(`Error refreshing index: ${error.message}`, 'ERROR');
    return false;
  }
}

// Exponential backoff function
async function backoff(attempt) {
  const delay = Math.min(
    config.backoffTimeMs * Math.pow(2, attempt), 
    300000 // Max 5 minutes
  );
  log(`Backing off for ${delay/1000} seconds (attempt ${attempt+1}/${config.maxRetries})`, 'WARN');
  await new Promise(resolve => setTimeout(resolve, delay));
}

// Delete in smaller chunks when a large batch fails
async function deleteInChunks(workIds, parentBatchNum) {
  const chunkSize = Math.min(1000, Math.ceil(workIds.length / 5)); // Try with ~5 chunks or 1000 max
  const chunks = [];
  
  for (let i = 0; i < workIds.length; i += chunkSize) {
    chunks.push(workIds.slice(i, i + chunkSize));
  }
  
  log(`Split batch ${parentBatchNum} into ${chunks.length} chunks of ~${chunkSize} work_ids each`);
  
  let totalDeleted = 0;
  let success = true;
  
  for (let i = 0; i < chunks.length; i++) {
    log(`Processing chunk ${i+1}/${chunks.length} of batch ${parentBatchNum}`);
    
    try {
      const chunkResponse = await client.deleteByQuery({
        index: config.openIndex,
        body: {
          query: {
            terms: {
              work_id: chunks[i]
            }
          }
        },
        refresh: false,
        wait_for_completion: true, // Wait for smaller chunks
        conflicts: 'proceed'
      });
      
      const chunkDeleted = chunkResponse.deleted || 0;
      totalDeleted += chunkDeleted;
      log(`Deleted ${chunkDeleted} documents from chunk ${i+1}/${chunks.length}`);
    } catch (error) {
      log(`Error in chunk ${i+1}: ${error.message}`, 'ERROR');
      success = false;
    }
  }
  
  return { success, deleted: totalDeleted };
}

// Replace the concurrentStreamingRemoval function with this improved version
async function concurrentStreamingRemoval() {
  log("Using concurrent streaming approach with parallel fetching");
  
  let totalProcessed = 0;
  let totalDeleted = 0;
  const startTime = Date.now();
  
  try {
    // Load checkpoint if exists
    const checkpoint = loadCheckpoint();
    let searchAfter = null;
    let startProcessed = 0; // Track starting point for rate calculation
    
    if (checkpoint && checkpoint.lastSearchAfter) {
      searchAfter = checkpoint.lastSearchAfter;
      totalProcessed = checkpoint.totalProcessed || 0;
      totalDeleted = checkpoint.totalDeleted || 0;
      startProcessed = totalProcessed; // Store initial value to adjust rate calculation
      log(`Resuming from checkpoint, already processed ${totalProcessed} work_ids, deleted ${totalDeleted} duplicates`);
    }
    
    // Check for start work_id command line argument
    let startWorkId = null;
    const args = process.argv.slice(2);
    const startArg = args.find(arg => arg.startsWith('--start-work-id='));
    if (startArg) {
      startWorkId = startArg.split('=')[1];
      log(`Starting from work_id: ${startWorkId}`);
    }
    
    let hasMore = true;
    let batchCount = 0;
    let batchSize = config.batchSize;
    
    // Queue to hold batches waiting to be processed
    const batchQueue = [];
    
    // Queue and tracking for fetch operations
    const fetchQueue = [];
    const fetchInProgress = new Set();
    
    // Function to fetch a batch given a search_after value
    async function fetchBatch(afterValue, batchId) {
      try {
        const searchBody = {
          size: batchSize,
          _source: ["work_id"],
          query: {
            bool: {
              must: [
                { exists: { field: "work_id" } }
              ]
            }
          },
          sort: [{ "work_id": "asc" }]
        };
        
        // Add range condition for the first fetch if startWorkId is provided
        if (startWorkId && !afterValue) {
          searchBody.query.bool.must.push({
            range: {
              work_id: {
                gte: startWorkId
              }
            }
          });
        }
        
        if (afterValue) {
          searchBody.search_after = afterValue;
        }
        
        const response = await client.search({
          index: config.closedIndex,
          body: searchBody
        });
        
        const hits = response.hits?.hits || [];
        
        if (hits.length === 0) {
          return { done: true, workIds: [], searchAfter: null, batchId };
        }
        
        // Extract work_ids
        const workIds = hits.map(hit => hit._source?.work_id).filter(Boolean);
        const newSearchAfter = hits[hits.length - 1].sort;
        
        log(`Batch ${batchId}: Fetched ${workIds.length} work_ids`);
        return { done: false, workIds, searchAfter: newSearchAfter, batchId };
      } catch (error) {
        log(`Error in fetch ${batchId}: ${error.message}`, 'ERROR');
        return { error: error.message, workIds: [], searchAfter: afterValue, batchId };
      }
    }
    
    // Function to start a new fetch if needed
    function startNewFetch() {
      if (!hasMore || fetchInProgress.size >= config.fetchConcurrency) {
        return;
      }
      
      const nextBatchId = `fetch-${batchCount + fetchQueue.length + fetchInProgress.size + 1}`;
      fetchInProgress.add(nextBatchId);
      
      // Use the latest search_after value
      const currentSearchAfter = searchAfter;
      
      log(`Starting fetch ${nextBatchId} (concurrent fetches: ${fetchInProgress.size})`);
      
      // Start fetch asynchronously
      fetchBatch(currentSearchAfter, nextBatchId)
        .then(result => {
          fetchInProgress.delete(nextBatchId);
          
          if (result.error) {
            log(`Fetch ${result.batchId} failed: ${result.error}`, 'ERROR');
            return;
          }
          
          if (result.done) {
            hasMore = false;
            log(`No more work IDs to fetch (${result.batchId})`);
            return;
          }
          
          // Add to queue and update last search_after
          fetchQueue.push(result);
          searchAfter = result.searchAfter;
          
          log(`Fetch ${result.batchId} completed: ${result.workIds.length} work IDs, queue: ${fetchQueue.length}`);
        })
        .catch(error => {
          fetchInProgress.delete(nextBatchId);
          log(`Unexpected error in fetch ${nextBatchId}: ${error.message}`, 'ERROR');
        });
    }
    
    // Function to process a batch (delete duplicates)
    async function processBatch(workIds, batchNum) {
      try {
        log(`Batch ${batchNum}: Processing ${workIds.length} work_ids`);
        
        const deleteResponse = await client.deleteByQuery({
          index: config.openIndex,
          refresh: false,
          wait_for_completion: config.deleteWaitForCompletion,
          conflicts: 'proceed',
          body: {
            query: {
              terms: {
                work_id: workIds
              }
            }
          }
        });
        
        // Handle async or sync response accordingly
        if (!config.deleteWaitForCompletion) {
          const taskId = deleteResponse.task;
          log(`Batch ${batchNum}: Delete operation submitted as task ${taskId}`);
          return { success: true, deleted: 0, taskId };
        } else {
          const deleted = deleteResponse.deleted || 0;
          log(`Batch ${batchNum}: Deleted ${deleted} documents`);
          return { success: true, deleted };
        }
      } catch (error) {
        log(`Error in batch ${batchNum}: ${error.message}`, 'ERROR');
        
        // Try with smaller chunks if configured
        try {
          const chunkedResult = await deleteInChunks(workIds, batchNum);
          return { success: true, deleted: chunkedResult.deleted };
        } catch (subError) {
          return { success: false, deleted: 0, error: subError.message };
        }
      }
    }
    
    // Start initial fetch operations
    for (let i = 0; i < config.fetchConcurrency && hasMore; i++) {
      startNewFetch();
    }
    
    // Process batches concurrently while fetching new ones
    const inProgress = new Set();
    
    // Timer to log concurrency status
    const concurrencyTimer = setInterval(() => {
      log(`CONCURRENCY STATUS: Active deletes: ${inProgress.size}/${config.concurrentBatches}, ` +
          `Active fetches: ${fetchInProgress.size}/${config.fetchConcurrency}, ` +
          `Queues: Processing=${batchQueue.length}, Fetched=${fetchQueue.length}`);
    }, 5000);
    
    // Main processing loop
    while (hasMore || fetchQueue.length > 0 || batchQueue.length > 0 || 
           inProgress.size > 0 || fetchInProgress.size > 0) {
      
      // Start new fetches if needed
      while (fetchInProgress.size < config.fetchConcurrency && 
             fetchQueue.length + fetchInProgress.size < config.fetchAhead && hasMore) {
        startNewFetch();
      }
      
      // Move items from fetch queue to batch queue
      while (fetchQueue.length > 0) {
        const nextBatch = fetchQueue.shift();
        batchCount++;
        const processingBatchNum = `process-${batchCount}`;
        batchQueue.push({ workIds: nextBatch.workIds, batchNum: processingBatchNum });
      }
      
      // Process batches up to concurrency limit
      while (batchQueue.length > 0 && inProgress.size < config.concurrentBatches) {
        const batch = batchQueue.shift();
        inProgress.add(batch.batchNum);
        
        log(`Starting processing batch ${batch.batchNum} (concurrent tasks: ${inProgress.size})`);
        
        processBatch(batch.workIds, batch.batchNum)
          .then(result => {
            inProgress.delete(batch.batchNum);
            
            if (result.success) {
              // If using async mode, we don't know exact delete count
              const deleteCount = result.deleted || 0;
              totalDeleted += deleteCount;
              totalProcessed += batch.workIds.length;
              
              log(`Completed batch ${batch.batchNum}, total processed: ${totalProcessed}, ` +
                  `total deleted: ${totalDeleted}`);
            } else {
              log(`Failed to process batch ${batch.batchNum}: ${result.error}`, 'ERROR');
            }
            
            // Save checkpoint periodically
            if (batchCount % config.checkpointInterval === 0) {
              saveCheckpoint({
                lastSearchAfter: searchAfter,
                totalProcessed,
                totalDeleted,
                elapsedTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
              });
              
              // Progress reporting
              const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(2);
              const processedSinceStart = totalProcessed - startProcessed;
              const rate = (processedSinceStart / parseFloat(elapsedMinutes)).toFixed(2);
              log(`Progress: Processed ${totalProcessed} work_ids (${rate}/min since restart), deleted ${totalDeleted} duplicates`, 'INFO', true);
              
              // Refresh index periodically
              if (batchCount % config.refreshInterval === 0) {
                refreshIndex().catch(e => log(`Error refreshing index: ${e.message}`, 'WARN'));
              }
            }
          })
          .catch(error => {
            inProgress.delete(batch.batchNum);
            log(`Unexpected error in batch ${batch.batchNum}: ${error.message}`, 'ERROR');
          });
      }
      
      // Short delay to prevent CPU spinning
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Final refresh
    await refreshIndex();
    
    // Clean up
    clearInterval(concurrencyTimer);
    
    // Clean up checkpoint file
    if (fs.existsSync(config.checkpointFile)) {
      fs.unlinkSync(config.checkpointFile);
      log('Checkpoint file removed after successful completion');
    }
    
    const duration = (Date.now() - startTime) / 1000;
    log(`Operation complete. Processed ${totalProcessed} work_ids in ${Math.ceil(duration/60)} minutes`);
    log(`Deleted ${totalDeleted} duplicate documents from the open index`);
    
    return { success: true, totalProcessed, totalDeleted, duration };
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'ERROR');
    return { success: false, error: error.message };
  }
}

// Run with error handling and graceful shutdown
async function main() {
  const mainStartTime = Date.now();
  
  // Register shutdown handler
  process.on('SIGINT', () => {
    log('Received SIGINT, saving checkpoint before exit', 'WARN');
    
    // We need to save the latest state
    const checkpoint = loadCheckpoint();
    if (checkpoint) {
      checkpoint.terminatedManually = true;
      checkpoint.terminationTime = new Date().toISOString();
      saveCheckpoint(checkpoint);
    }
    
    log('Process terminated by user. Run again to resume from checkpoint.', 'WARN');
    process.exit(0);
  });
  
  try {
    log('Starting duplicate removal process');
    
    // Version check
    try {
      const info = await client.info();
      log(`Elasticsearch version: ${info.version?.number || 'unknown'}`);
    } catch (error) {
      log(`Could not determine Elasticsearch version: ${error.message}`, 'WARN');
    }
    
    // Check if this is a resume from previous checkpoint
    const checkpoint = loadCheckpoint();
    if (checkpoint && checkpoint.terminatedManually) {
      log('Resuming after manual termination', 'INFO');
    }
    
    // Run the concurrent approach
    const result = await concurrentStreamingRemoval();
    
    if (result.success) {
      log('Duplicate removal process completed successfully');
      log(`Summary: Processed ${result.totalProcessed} work_ids, deleted ${result.totalDeleted} duplicates in ${(result.duration / 60).toFixed(2)} minutes`);
      process.exit(0);
    } else {
      log(`Process failed: ${result.error}`, 'ERROR');
      log('Run again to resume from checkpoint');
      process.exit(1);
    }
  } catch (error) {
    log(`Unhandled exception: ${error.stack || error.message}`, 'FATAL');
    log('Process terminated with errors. Run again to resume from checkpoint.');
    process.exit(1);
  }
}

// Start the process
main();