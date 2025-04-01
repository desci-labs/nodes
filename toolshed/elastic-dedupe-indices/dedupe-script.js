require("dotenv").config();
const { Client } = require("@elastic/elasticsearch");
const fs = require("fs");
const path = require("path");

const DEBUG = true;

// Configuration - centralize all configurable variables
const config = {
  // Indexes
  closedIndex: "works_closed_2024_09_04_dedupe_optimized2",
  openIndex: "works_2024_08_27_dedupe_optimized2",

  // Batch sizes
  batchSize: 10000, // Size of main fetch batches
  mgetBatchSize: 5000, // Size of batches for mget operations
  bulkDeleteSize: 5000, // Size of batches for bulk delete operations

  // Concurrency settings
  concurrentBatches: 7, // Number of concurrent processing operations
  fetchAhead: 4, // How many batches to fetch ahead

  // Scroll settings
  scrollTimeout: "2m", // Scroll context timeout
  scrollRetries: 3, // Number of retries for scroll issues

  // Checkpointing
  checkpointInterval: 10, // Save checkpoint every N batches
  checkPointEveryNMinutes: 2, // Also save checkpoint every N minutes
  checkpointFile: path.join(__dirname, "duplicate_removal_checkpoint.json"),

  // Logging
  logFile: path.join(__dirname, "duplicate_removal.log"),
  statusLogIntervalSec: 30, // Status log interval in seconds
  debugEnabled: true, // Enable debug logging

  // Elasticsearch client settings
  maxRetries: 5, // Max retries for ES operations
  requestTimeout: 120000, // Request timeout in ms (2 minutes)
  connectionTimeoutMs: 30000, // Connection timeout

  // Error handling
  backoffTimeMs: 30000, // Initial backoff time in ms
  backoffFactor: 2, // Exponential backoff factor
  maxBackoffMs: 300000, // Maximum backoff time (5 minutes)

  // Index operations
  refreshInterval: 50, // Refresh index every N batches
  waitForCompletion: false, // For delete operations
  waitForRefresh: false, // Don't wait for index refreshes
  parallelMget: true, // Parallelize mget operations within a batch
  mgetMaxParallel: 3, // Maximum parallel mget operations
  tasksCheckInterval: 5000, // How often to check tasks (ms)
  maxTasksInProgress: 50, // Maximum number of tasks to keep in flight
  taskTimeout: 300000, // Timeout for tasks (5 minutes)
  showRateInStatus: true, // Show processing rate in status logs
};

// Initialize ES client with config values
const client = new Client({
  node: process.env.ES_HOST,
  auth: {
    apiKey: process.env.ES_API_KEY,
  },
  maxRetries: config.maxRetries,
  requestTimeout: config.requestTimeout,
  connectionTimeout: config.connectionTimeoutMs,
  sniffOnStart: false,
  ssl: { rejectUnauthorized: false },
  tls: { rejectUnauthorized: false },
});

// Setup logging functions
function debugLog(message, data) {
  if (!config.debugEnabled) return;
  log(`DEBUG: ${message}`);
  if (data) {
    try {
      log(
        `DEBUG DATA: ${
          typeof data === "string" ? data : JSON.stringify(data, null, 2)
        }`
      );
    } catch (e) {
      log(`DEBUG DATA: [Could not stringify: ${e.message}]`);
    }
  }
}

function log(message, level = "INFO", highlight = false) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  if (highlight) {
    console.log(`\x1b[32m${logMessage}\x1b[0m`);
  } else {
    console.log(logMessage);
  }
  fs.appendFileSync(config.logFile, logMessage + "\n");
}

// Checkpoint management
function loadCheckpoint() {
  try {
    if (fs.existsSync(config.checkpointFile)) {
      const data = fs.readFileSync(config.checkpointFile, "utf8");
      log(`Loading checkpoint file: ${config.checkpointFile}`);
      return JSON.parse(data);
    }
  } catch (error) {
    log(`Error loading checkpoint: ${error.message}`, "ERROR");
  }
  return null;
}

function saveCheckpoint(checkpoint) {
  try {
    fs.writeFileSync(
      config.checkpointFile,
      JSON.stringify(checkpoint, null, 2)
    );
    log(
      `Checkpoint saved at batch ${
        checkpoint.batchCount || 0
      }, total processed: ${checkpoint.totalProcessed || 0}`
    );
  } catch (error) {
    log(`Error saving checkpoint: ${error.message}`, "ERROR");
  }
}

// Index operations
async function refreshIndex() {
  try {
    if (config.waitForRefresh) {
      // Original blocking refresh
      await client.indices.refresh({ index: config.openIndex });
      log(`Refreshed index ${config.openIndex}`);
    } else {
      // Non-blocking refresh
      client.indices
        .refresh({ index: config.openIndex })
        .then(() => log(`Refreshed index ${config.openIndex}`))
        .catch((e) => log(`Error refreshing index: ${e.message}`, "WARN"));

      log(`Scheduled index refresh for ${config.openIndex} (not waiting)`);
    }
    return true;
  } catch (error) {
    log(`Error refreshing index: ${error.message}`, "ERROR");
    return false;
  }
}

// Enable id_field_data setting
async function enableIdFieldData() {
  try {
    log("Enabling indices.id_field_data.enabled setting...");

    const response = await client.cluster.putSettings({
      body: {
        persistent: {
          "indices.id_field_data.enabled": true,
        },
      },
    });

    log(`Successfully enabled id_field_data: ${JSON.stringify(response)}`);
    return true;
  } catch (error) {
    log(`Failed to enable id_field_data: ${error.message}`, "ERROR");
    return false;
  }
}

// Fetch IDs from the open index using scroll
async function fetchOpenIdsWithScroll(
  scrollId = null,
  batchId,
  retryCount = 0
) {
  try {
    let response;

    if (scrollId) {
      response = await client.scroll({
        scroll_id: scrollId,
        scroll: config.scrollTimeout,
      });
    } else {
      // If starting fresh, try to clear any abandoned scroll contexts
      try {
        await client.clearScroll({
          scroll_id: "_all", // Clear all scroll contexts for this client
        });
        log(`Cleared all scroll contexts before starting new one`);
      } catch (clearError) {
        log(`Could not clear scroll contexts: ${clearError.message}`, "WARN");
      }

      response = await client.search({
        index: config.openIndex,
        scroll: config.scrollTimeout,
        body: {
          size: config.batchSize,
          _source: false,
          query: { match_all: {} },
        },
      });
    }

    const hits = response.hits?.hits || [];
    const newScrollId = response._scroll_id;

    if (hits.length === 0) {
      // Clear the scroll when done
      if (newScrollId) {
        try {
          await client.clearScroll({ scroll_id: newScrollId });
          log("Cleared scroll context");
        } catch (e) {
          log(`Error clearing scroll: ${e.message}`, "WARN");
        }
      }
      return { done: true, ids: [], scrollId: null, batchId };
    }

    const documentIds = hits.map((hit) => hit._id);
    log(`Batch ${batchId}: Fetched ${documentIds.length} IDs from open index`);

    return { done: false, ids: documentIds, scrollId: newScrollId, batchId };
  } catch (error) {
    log(`Error in fetch ${batchId}: ${error.message}`, "ERROR");

    // Handle common scroll errors
    if (
      error.message.includes("search_context_missing_exception") ||
      error.message.includes("No search context found for id")
    ) {
      // If we have too many retries, start fresh
      if (retryCount >= config.scrollRetries) {
        log(`Too many scroll context failures, starting fresh`);
        return { error: error.message, ids: [], scrollId: null, batchId };
      }

      // Retry with a new search instead of resuming
      log(
        `Lost scroll context, retrying with new search (retry ${
          retryCount + 1
        })`
      );
      return await fetchOpenIdsWithScroll(null, batchId, retryCount + 1);
    }

    return { error: error.message, ids: [], scrollId, batchId };
  }
}

// Optimize mget to run in parallel
async function checkIdsInClosedIndex(ids, batchId) {
  const duplicates = [];
  const batchSize = config.mgetBatchSize;
  const subBatches = [];

  // Split into sub-batches
  for (let i = 0; i < ids.length; i += batchSize) {
    subBatches.push(ids.slice(i, i + batchSize));
  }

  if (config.parallelMget) {
    // Process batches in parallel, but limit concurrency
    const runningBatches = new Set();
    let nextBatchIndex = 0;

    while (nextBatchIndex < subBatches.length || runningBatches.size > 0) {
      // Start new batches up to max parallel
      while (
        runningBatches.size < config.mgetMaxParallel &&
        nextBatchIndex < subBatches.length
      ) {
        const batchIndex = nextBatchIndex++;
        const batchIds = subBatches[batchIndex];

        runningBatches.add(batchIndex);

        // Process this batch async
        (async () => {
          try {
            log(
              `Batch ${batchId}: Checking sub-batch ${batchIndex + 1}/${
                subBatches.length
              } (${batchIds.length} IDs)`
            );

            const response = await client.mget({
              index: config.closedIndex,
              body: { ids: batchIds },
            });

            // Find which documents exist
            const existingIds = response.docs
              .filter((doc) => doc.found)
              .map((doc) => doc._id);

            // Add to duplicates (needs synchronization)
            if (existingIds.length > 0) {
              duplicates.push(...existingIds);
              log(
                `Batch ${batchId}, sub-batch ${batchIndex + 1}: Found ${
                  existingIds.length
                } duplicates`
              );
            }
          } catch (error) {
            log(
              `Error checking sub-batch ${batchIndex + 1} of ${batchId}: ${
                error.message
              }`,
              "ERROR"
            );
          } finally {
            runningBatches.delete(batchIndex);
          }
        })();
      }

      // Short wait before checking again
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } else {
    // Original sequential processing
    for (let i = 0; i < subBatches.length; i++) {
      const batchIds = subBatches[i];
      log(
        `Batch ${batchId}: Checking ${batchIds.length} IDs in closed index (${
          i + 1
        }-${i + batchIds.length}/${ids.length})`
      );

      // Use mget to efficiently check multiple IDs
      try {
        const response = await client.mget({
          index: config.closedIndex,
          body: {
            ids: batchIds,
          },
        });

        // Find which documents exist
        const existingIds = response.docs
          .filter((doc) => doc.found)
          .map((doc) => doc._id);

        duplicates.push(...existingIds);

        log(
          `Batch ${batchId}: Found ${existingIds.length} duplicates in this sub-batch`
        );
      } catch (error) {
        log(`Error checking IDs in closed index: ${error.message}`, "ERROR");
        // Continue with the next batch despite errors
      }
    }
  }

  log(
    `Batch ${batchId}: Found total of ${duplicates.length} duplicates in closed index`
  );
  return duplicates;
}

// Modified delete function to use async tasks
async function deleteDuplicatesFromOpen(duplicateIds, batchId) {
  if (duplicateIds.length === 0) {
    return { success: true, deleted: 0 };
  }

  try {
    log(
      `Batch ${batchId}: Scheduling deletion of ${duplicateIds.length} duplicates from open index`
    );

    // Use bulk delete for better performance
    const operations = duplicateIds.flatMap((id) => [
      { delete: { _index: config.openIndex, _id: id } },
    ]);

    // If not waiting for completion, use deleteByQuery instead of bulk
    // as it has better support for async operation
    if (!config.waitForCompletion) {
      const deleteResponse = await client.deleteByQuery({
        index: config.openIndex,
        refresh: false,
        wait_for_completion: false, // Don't wait for completion
        conflicts: "proceed",
        body: {
          query: {
            ids: {
              values: duplicateIds,
            },
          },
        },
      });

      // Store the task ID
      const taskId = deleteResponse.task;
      log(
        `Batch ${batchId}: Deletion scheduled as task ${taskId} (not waiting for completion)`
      );

      // Track the task if needed
      trackDeleteTask(taskId, duplicateIds.length, batchId);

      return { success: true, deleted: 0, taskId };
    } else {
      // Original synchronous version
      const bulkResponse = await client.bulk({
        operations,
        refresh: false,
      });

      // Count successfully deleted documents
      const deleted = bulkResponse.items.filter(
        (item) =>
          item.delete?.result === "deleted" ||
          item.delete?.status === 200 ||
          item.delete?.status === 201
      ).length;

      log(
        `Batch ${batchId}: Successfully deleted ${deleted}/${duplicateIds.length} duplicates`
      );
      return { success: true, deleted };
    }
  } catch (error) {
    log(`Error deleting duplicates: ${error.message}`, "ERROR");

    // Try with smaller batches if the bulk operation failed
    try {
      return await deleteInSmallBatches(duplicateIds, batchId);
    } catch (subError) {
      log(
        `Failed to delete even with smaller batches: ${subError.message}`,
        "ERROR"
      );
      return { success: false, deleted: 0 };
    }
  }
}

// Delete in smaller batches
async function deleteInSmallBatches(ids, batchId) {
  const chunkSize = config.bulkDeleteSize;
  const chunks = [];

  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  log(
    `Splitting batch ${batchId} into ${chunks.length} chunks of ~${chunkSize} IDs each`
  );

  let totalDeleted = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const operations = chunks[i].flatMap((id) => [
        { delete: { _index: config.openIndex, _id: id } },
      ]);

      const bulkResponse = await client.bulk({
        operations,
        refresh: false,
      });

      const deleted = bulkResponse.items.filter(
        (item) =>
          item.delete?.result === "deleted" ||
          item.delete?.status === 200 ||
          item.delete?.status === 201
      ).length;

      totalDeleted += deleted;
      log(
        `Chunk ${i + 1}/${chunks.length}: Deleted ${deleted}/${
          chunks[i].length
        } documents`
      );
    } catch (error) {
      log(`Error in chunk ${i + 1}: ${error.message}`, "ERROR");
      // Continue with the next chunk despite errors
    }
  }

  return { success: true, deleted: totalDeleted };
}

// Task tracking for async deletions
const taskTracker = {
  tasks: new Map(), // Map of taskId -> task info

  // Add a new task to track
  addTask(taskId, docCount, batchId) {
    this.tasks.set(taskId, {
      taskId,
      batchId,
      docCount,
      startTime: Date.now(),
      status: "started",
      completed: false,
    });
  },

  // Update task status
  updateTask(taskId, status, deleted = 0) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      task.lastChecked = Date.now();
      task.deleted = deleted;

      if (status === "completed" || status === "failed") {
        task.completed = true;
        task.completionTime = Date.now();
      }
    }
  },

  // Check if any tasks are still in progress
  hasActiveTasks() {
    let activeTasks = 0;
    for (const [id, task] of this.tasks.entries()) {
      if (!task.completed) {
        activeTasks++;
      }
    }
    return activeTasks > 0;
  },

  // Get stats about tasks
  getStats() {
    let completed = 0;
    let inProgress = 0;
    let failed = 0;
    let totalDeleted = 0;

    for (const [id, task] of this.tasks.entries()) {
      if (task.completed) {
        if (task.status === "completed") {
          completed++;
          totalDeleted += task.deleted || 0;
        } else {
          failed++;
        }
      } else {
        inProgress++;
      }
    }

    return { completed, inProgress, failed, totalDeleted };
  },

  // Check and clean up old completed tasks
  cleanup() {
    const now = Date.now();
    for (const [id, task] of this.tasks.entries()) {
      if (
        task.completed &&
        task.completionTime &&
        now - task.completionTime > 3600000
      ) {
        this.tasks.delete(id);
      }
    }
  },
};

// Function to track a task
function trackDeleteTask(taskId, docCount, batchId) {
  taskTracker.addTask(taskId, docCount, batchId);
}

// Periodic task status checker
async function checkTaskStatus() {
  if (taskTracker.tasks.size === 0) return;

  // Get all incomplete tasks
  const incompleteTasks = Array.from(taskTracker.tasks.entries())
    .filter(([id, task]) => !task.completed)
    .map(([id, task]) => id);

  if (incompleteTasks.length === 0) return;

  // Check tasks in batches
  const batchSize = 10;
  for (let i = 0; i < incompleteTasks.length; i += batchSize) {
    const batch = incompleteTasks.slice(i, i + batchSize);

    for (const taskId of batch) {
      try {
        const taskInfo = await client.tasks.get({
          task_id: taskId,
        });

        const taskStatus = taskInfo.completed ? "completed" : "running";

        if (taskInfo.completed) {
          // Extract deleted count if available
          let deleted = 0;
          if (taskInfo.response && taskInfo.response.deleted) {
            deleted = taskInfo.response.deleted;
          }

          taskTracker.updateTask(taskId, "completed", deleted);
          log(`Task ${taskId} completed, deleted ${deleted} documents`);
        } else {
          // Update last checked time
          taskTracker.updateTask(taskId, "running");

          // Check for timeouts
          const task = taskTracker.tasks.get(taskId);
          if (task && Date.now() - task.startTime > config.taskTimeout) {
            log(
              `Task ${taskId} timed out after ${
                config.taskTimeout / 1000
              }s, marking as failed`,
              "WARN"
            );
            taskTracker.updateTask(taskId, "failed");
          }
        }
      } catch (error) {
        log(`Error checking task ${taskId}: ${error.message}`, "WARN");

        // If task not found, mark as completed
        if (error.message.includes("not found")) {
          taskTracker.updateTask(taskId, "completed");
        }
      }
    }
  }

  // Print task statistics
  const stats = taskTracker.getStats();
  log(
    `Task status: ${stats.completed} completed, ${stats.inProgress} in progress, ${stats.failed} failed, ${stats.totalDeleted} docs deleted`
  );

  // Clean up old tasks
  taskTracker.cleanup();
}

// Main process function
async function dedupOpenIndex() {
  log("Starting deduplication process: open-to-closed index check");

  let totalProcessed = 0;
  let totalDuplicatesFound = 0;
  let totalDeleted = 0;
  const startTime = Date.now();
  let lastCheckpointTime = Date.now();
  let startProcessed = 0; // Add this to track starting point

  try {
    // Load checkpoint if exists
    const checkpoint = loadCheckpoint();
    let scrollId = null;

    if (checkpoint && checkpoint.scrollId) {
      scrollId = checkpoint.scrollId;
      totalProcessed = checkpoint.totalProcessed || 0;
      totalDuplicatesFound = checkpoint.totalDuplicatesFound || 0;
      totalDeleted = checkpoint.totalDeleted || 0;
      startProcessed = totalProcessed; // Store initial processed count
      log(
        `Resuming from checkpoint, already processed ${totalProcessed} IDs, found ${totalDuplicatesFound} duplicates, deleted ${totalDeleted}`
      );
    }

    let batchCount = 0;
    let hasMore = true;

    // Queue for processing batches
    const batchQueue = [];
    const inProgress = new Set();

    // Timer for status reporting with rate calculation
    const statusTimer = setInterval(() => {
      const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(2);
      const processedSinceStart = totalProcessed - startProcessed;
      const rate = (processedSinceStart / parseFloat(elapsedMinutes)).toFixed(
        2
      );

      log(
        `STATUS: Processed ${totalProcessed} IDs (${rate}/min), found ${totalDuplicatesFound} duplicates, deleted ${totalDeleted}. Active batches: ${inProgress.size}, Queue: ${batchQueue.length}`
      );
    }, config.statusLogIntervalSec * 1000);

    // Add task monitoring timer
    const taskMonitorTimer = setInterval(async () => {
      await checkTaskStatus();
    }, config.tasksCheckInterval);

    // If not waiting for completion, keep track of estimated deletions
    let estimatedDeleted = 0;

    // Main loop
    while (hasMore || batchQueue.length > 0 || inProgress.size > 0) {
      // Fetch more IDs if needed
      if (hasMore && batchQueue.length < config.fetchAhead) {
        batchCount++;
        const batchId = `batch-${batchCount}`;

        log(
          `Fetching batch ${batchId} from open index${
            scrollId ? " (with scroll)" : ""
          }`
        );
        const result = await fetchOpenIdsWithScroll(scrollId, batchId);

        if (result.error) {
          log(`Error fetching batch ${batchId}: ${result.error}`, "ERROR");

          // Scroll context is gone, start fresh
          scrollId = null;

          // Implement backoff to avoid hammering the server
          const backoffMs = Math.min(
            config.maxBackoffMs,
            config.backoffTimeMs *
              Math.pow(config.backoffFactor, Math.min(5, batchCount % 10))
          );
          log(`Backing off for ${backoffMs / 1000} seconds before retrying`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        if (result.done) {
          hasMore = false;
          log(`No more IDs to fetch from open index`);
          continue;
        }

        scrollId = result.scrollId;
        batchQueue.push({
          batchId,
          ids: result.ids,
        });
      }

      // Process batches up to concurrency limit
      while (
        batchQueue.length > 0 &&
        inProgress.size < config.concurrentBatches
      ) {
        const batch = batchQueue.shift();
        inProgress.add(batch.batchId);

        // Process this batch asynchronously
        (async () => {
          try {
            // Step 1: Check which IDs exist in closed index
            log(
              `Processing batch ${batch.batchId}: Checking ${batch.ids.length} IDs`
            );
            const duplicateIds = await checkIdsInClosedIndex(
              batch.ids,
              batch.batchId
            );

            // Step 2: Delete duplicates from open index
            if (duplicateIds.length > 0) {
              log(
                `Batch ${batch.batchId}: Found ${duplicateIds.length} duplicates, deleting from open index`
              );
              const deleteResult = await deleteDuplicatesFromOpen(
                duplicateIds,
                batch.batchId
              );

              if (deleteResult.success) {
                if (config.waitForCompletion) {
                  totalDeleted += deleteResult.deleted;
                } else {
                  // If not waiting, use the number of duplicates as an estimate
                  estimatedDeleted += duplicateIds.length;
                  log(
                    `Batch ${batch.batchId}: Scheduled deletion of ${duplicateIds.length} duplicates (task: ${deleteResult.taskId})`
                  );
                }
              }
            } else {
              log(`Batch ${batch.batchId}: No duplicates found`);
            }

            // Update counters
            totalProcessed += batch.ids.length;
            totalDuplicatesFound += duplicateIds.length;

            // Save checkpoint periodically
            const minutesSinceCheckpoint =
              (Date.now() - lastCheckpointTime) / 60000;

            if (
              batchCount % config.checkpointInterval === 0 ||
              minutesSinceCheckpoint >= config.checkPointEveryNMinutes
            ) {
              saveCheckpoint({
                scrollId,
                totalProcessed,
                totalDuplicatesFound,
                totalDeleted,
                batchCount,
                elapsedTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
              });

              lastCheckpointTime = Date.now();

              // Ensure consistent rate calculation
              const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(
                2
              );
              const processedSinceStart = totalProcessed - startProcessed;
              const rate = (
                processedSinceStart / parseFloat(elapsedMinutes)
              ).toFixed(2);
              log(
                `Progress: Processed ${totalProcessed} IDs (${rate}/min), found ${totalDuplicatesFound} duplicates, deleted ${totalDeleted}`,
                "INFO",
                true
              );

              // Refresh index periodically
              if (batchCount % config.refreshInterval === 0) {
                refreshIndex().catch((e) =>
                  log(`Error refreshing index: ${e.message}`, "WARN")
                );
              }
            }
          } catch (error) {
            log(
              `Error processing batch ${batch.batchId}: ${error.message}`,
              "ERROR"
            );
          } finally {
            inProgress.delete(batch.batchId);
          }
        })();
      }

      // Short delay to prevent CPU spinning
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Wait for tasks to complete at the end
    if (!config.waitForCompletion) {
      log("Waiting for any remaining deletion tasks to complete...");

      // Check remaining tasks every few seconds
      while (taskTracker.hasActiveTasks()) {
        await checkTaskStatus();
        await new Promise((resolve) =>
          setTimeout(resolve, config.tasksCheckInterval)
        );
      }

      // Add task results to totals
      const stats = taskTracker.getStats();
      totalDeleted += stats.totalDeleted;

      log(
        `All deletion tasks completed, total deleted from tasks: ${stats.totalDeleted}`
      );
    }

    // Clean up
    clearInterval(statusTimer);
    clearInterval(taskMonitorTimer);

    // Final refresh
    await refreshIndex();

    // Clean up checkpoint file on successful completion
    if (fs.existsSync(config.checkpointFile)) {
      fs.unlinkSync(config.checkpointFile);
      log("Checkpoint file removed after successful completion");
    }

    // Final statistics with rate
    const duration = (Date.now() - startTime) / 1000;
    const finalRate = (
      (totalProcessed - startProcessed) /
      (duration / 60)
    ).toFixed(2);
    log(
      `Deduplication complete. Processed ${totalProcessed} IDs (${finalRate}/min), found ${totalDuplicatesFound} duplicates, deleted ${totalDeleted} in ${Math.ceil(
        duration / 60
      )} minutes`
    );

    return {
      success: true,
      totalProcessed,
      totalDuplicatesFound,
      totalDeleted,
      duration,
      rate: finalRate,
    };
  } catch (error) {
    log(`Fatal error: ${error.message}`, "ERROR");
    return { success: false, error: error.message };
  }
}

// Run the script
async function main() {
  const mainStartTime = Date.now();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    log("Received SIGINT, saving checkpoint before exit", "WARN");

    const checkpoint = loadCheckpoint();
    if (checkpoint) {
      checkpoint.terminatedManually = true;
      checkpoint.terminationTime = new Date().toISOString();
      saveCheckpoint(checkpoint);
    }

    log(
      "Process terminated by user. Run again to resume from checkpoint.",
      "WARN"
    );
    process.exit(0);
  });

  try {
    log("Starting duplicate removal process (open-to-closed check)");

    // Check Elasticsearch version
    try {
      const info = await client.info();
      log(`Elasticsearch version: ${info.version?.number || "unknown"}`);
    } catch (error) {
      log(
        `Could not determine Elasticsearch version: ${error.message}`,
        "WARN"
      );
    }

    // Enable id_field_data before continuing
    const idFieldDataEnabled = await enableIdFieldData();
    if (!idFieldDataEnabled) {
      log(
        "WARNING: Could not enable id_field_data. This is required for the script to work.",
        "ERROR"
      );
      process.exit(1);
    }

    // Run the deduplication
    const result = await dedupOpenIndex();

    if (result.success) {
      log("Duplicate removal process completed successfully");
      log(
        `Summary: Processed ${result.totalProcessed} IDs (${
          result.rate
        }/min), found ${result.totalDuplicatesFound} duplicates, deleted ${
          result.totalDeleted
        } in ${(result.duration / 60).toFixed(2)} minutes`
      );
      process.exit(0);
    } else {
      log(`Process failed: ${result.error}`, "ERROR");
      log("Run again to resume from checkpoint");
      process.exit(1);
    }
  } catch (error) {
    log(`Unhandled exception: ${error.stack || error.message}`, "FATAL");
    log("Process terminated with errors. Run again to resume from checkpoint.");
    process.exit(1);
  }
}

// Start the process
main();
