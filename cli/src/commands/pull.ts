import { Command } from "commander";
import { existsSync, mkdirSync, createWriteStream, unlinkSync } from "fs";
import { resolve, join, dirname } from "path";
import axios from "axios";
import chalk from "chalk";
import type { Writable } from "stream";
import {
  createSpinner,
  printSuccess,
  printError,
  printNodeInfo,
  formatBytes,
  symbols,
} from "../ui.js";
import { getEnvConfig } from "../config.js";
import { requireApiKey, resolveNodeUuid, getErrorMessage } from "../helpers.js";
import {
  getDraftNode,
  retrieveDraftFileTree,
} from "@desci-labs/nodes-lib/node";
import type { DriveObject } from "@desci-labs/desci-models";

interface DownloadProgress {
  current: number;
  total: number;
  currentFile: string;
  downloadedBytes: number;
}

/**
 * Downloads a file from IPFS gateway directly to disk using streaming.
 * This avoids loading large files entirely into memory.
 *
 * @param cid - The IPFS CID of the file to download
 * @param destPath - The destination file path to write to
 * @param onData - Optional callback invoked with bytes downloaded on each chunk
 * @returns Promise resolving to the total bytes written
 */
async function downloadFileToPath(
  cid: string,
  destPath: string,
  onData?: (bytesDownloaded: number) => void,
): Promise<number> {
  const { ipfsGateway } = getEnvConfig();
  const url = `${ipfsGateway}/${cid}`;

  let writeStream: Writable | null = null;
  let totalBytes = 0;

  try {
    const response = await axios({
      url,
      method: "get",
      responseType: "stream",
      timeout: 120000,
    });

    writeStream = createWriteStream(destPath);

    return await new Promise<number>((resolve, reject) => {
      const stream = response.data;

      stream.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (onData) {
          onData(chunk.length);
        }
      });

      stream.on("error", (err: Error) => {
        // Destroy write stream and clean up partial file
        if (writeStream) {
          writeStream.destroy();
        }
        try {
          if (existsSync(destPath)) {
            unlinkSync(destPath);
          }
        } catch {
          // Ignore cleanup errors
        }
        reject(err);
      });

      writeStream!.on("error", (err: Error) => {
        stream.destroy();
        try {
          if (existsSync(destPath)) {
            unlinkSync(destPath);
          }
        } catch {
          // Ignore cleanup errors
        }
        reject(err);
      });

      writeStream!.on("finish", () => {
        resolve(totalBytes);
      });

      stream.pipe(writeStream);
    });
  } catch (err) {
    // Clean up partial file on error
    if (writeStream) {
      writeStream.destroy();
    }
    try {
      if (existsSync(destPath)) {
        unlinkSync(destPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw err;
  }
}

async function downloadTree(
  item: DriveObject,
  basePath: string,
  onProgress: (progress: DownloadProgress) => void,
  progress: DownloadProgress,
): Promise<void> {
  if (item.type === "file") {
    const filePath = join(basePath, item.name);
    const fileDir = dirname(filePath);

    // Ensure directory exists
    if (!existsSync(fileDir)) {
      mkdirSync(fileDir, { recursive: true });
    }

    progress.current++;
    progress.currentFile = item.name;
    onProgress(progress);

    try {
      // Stream file directly to disk, tracking progress via onData callback
      await downloadFileToPath(item.cid, filePath, (bytesChunk) => {
        progress.downloadedBytes += bytesChunk;
        onProgress(progress);
      });
    } catch (err) {
      console.warn(
        chalk.yellow(`\n  Warning: Failed to download ${item.name}: ${err}`),
      );
    }
  } else if (item.type === "dir" && item.contains) {
    const dirPath = join(basePath, item.name);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    for (const child of item.contains) {
      await downloadTree(child, dirPath, onProgress, progress);
    }
  }
}

function countFiles(items: DriveObject[]): number {
  let count = 0;
  for (const item of items) {
    if (item.type === "file") {
      count++;
    } else if (item.type === "dir" && item.contains) {
      count += countFiles(item.contains);
    }
  }
  return count;
}

function findItemByPath(
  items: DriveObject[],
  targetPath: string,
): DriveObject | null {
  const parts = targetPath.split("/").filter(Boolean);
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "root")) {
    return {
      name: "root",
      path: "root",
      cid: "",
      type: "dir",
      contains: items,
    } as DriveObject;
  }

  let current: DriveObject[] = items;
  let found: DriveObject | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "root" && i === 0) continue;

    found = current.find((item) => item.name === part) || null;
    if (!found) return null;

    if (found.type === "dir" && found.contains) {
      current = found.contains;
    } else if (i < parts.length - 1) {
      return null; // Trying to traverse into a file
    }
  }

  return found;
}

export function createPullCommand(): Command {
  return new Command("pull")
    .description("Pull files from a DeSci node to local folder")
    .argument("[node]", "Node UUID or partial UUID")
    .option("-o, --output <path>", "Output directory", ".")
    .option("-p, --path <path>", "Path within node to pull", "root")
    .action(async (nodeArg: string | undefined, options) => {
      try {
        // Check API key
        requireApiKey();

        // Resolve node UUID (picker or partial match)
        const targetUuid = await resolveNodeUuid(nodeArg, {
          selectMessage: "Select a node to pull from:",
        });

        // Get node info
        const nodeSpinner = createSpinner("Loading node...");
        nodeSpinner.start();

        let node;
        try {
          node = await getDraftNode(targetUuid);
          nodeSpinner.succeed(`Found node: ${chalk.cyan(node.title)}`);
        } catch {
          nodeSpinner.fail(`Failed to load node: ${targetUuid}`);
          process.exit(1);
        }

        printNodeInfo({
          uuid: node.uuid,
          title: node.title,
          isPublished: node.manifestData?.dpid !== undefined,
          cid: node.cid,
          dpidAlias: node.dpidAlias,
        });

        // Get drive tree
        const treeSpinner = createSpinner("Fetching file tree...");
        treeSpinner.start();

        let tree: DriveObject[];
        try {
          const result = await retrieveDraftFileTree(targetUuid);
          tree = result.tree;
          const fileCount = countFiles(tree);
          treeSpinner.succeed(`Found ${fileCount} files`);
        } catch (err) {
          treeSpinner.fail("Failed to fetch file tree");
          throw err;
        }

        // Find target path
        const targetItem = findItemByPath(tree, options.path);
        if (!targetItem) {
          printError(`Path not found in node: ${options.path}`);
          process.exit(1);
        }

        const itemsToDownload =
          targetItem.type === "dir" && targetItem.contains
            ? targetItem.contains
            : [targetItem];
        const totalFiles = countFiles(itemsToDownload);

        if (totalFiles === 0) {
          printError("No files to download at this path");
          process.exit(1);
        }

        // Resolve output path
        const outputPath = resolve(process.cwd(), options.output);
        if (!existsSync(outputPath)) {
          mkdirSync(outputPath, { recursive: true });
        }

        console.log(
          `\n${symbols.download} Downloading to: ${chalk.cyan(outputPath)}`,
        );
        console.log(`${symbols.info} Files to download: ${totalFiles}\n`);

        // Download files
        const downloadSpinner = createSpinner("Downloading...");
        downloadSpinner.start();

        const progress: DownloadProgress = {
          current: 0,
          total: totalFiles,
          currentFile: "",
          downloadedBytes: 0,
        };

        const startTime = Date.now();

        try {
          for (const item of itemsToDownload) {
            await downloadTree(
              item,
              outputPath,
              (p) => {
                downloadSpinner.text = `Downloading ${chalk.cyan(p.currentFile)} (${p.current}/${p.total}) - ${formatBytes(p.downloadedBytes)}`;
              },
              progress,
            );
          }

          const duration = Date.now() - startTime;
          downloadSpinner.succeed(
            `Downloaded ${progress.current} files (${formatBytes(progress.downloadedBytes)}) in ${Math.round(duration / 1000)}s`,
          );

          printSuccess("Pull complete!");

          console.log(chalk.dim("Files saved to:"), chalk.cyan(outputPath));
        } catch (err) {
          downloadSpinner.fail("Download failed");
          throw err;
        }
      } catch (error: unknown) {
        printError(`Pull failed: ${getErrorMessage(error)}`);
        process.exit(1);
      }
    });
}

