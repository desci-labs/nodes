import { Command } from "commander";
import { existsSync, statSync } from "fs";
import { resolve, basename, relative } from "path";
import { glob } from "glob";
import chalk from "chalk";
import { input, confirm } from "../prompts.js";
import {
  createSpinner,
  printSuccess,
  printError,
  printNodeInfo,
  formatBytes,
  symbols,
} from "../ui.js";
import { getEnvConfig } from "../config.js";
import { requireApiKey, resolveNodeUuid, createNodeInteractive, getErrorMessage } from "../helpers.js";
import {
  createDraftNode,
  getDraftNode,
  retrieveDraftFileTree,
  deleteData,
  prePublishDraftNode,
  uploadFiles,
  createNewFolder,
  addPdfComponent,
} from "@desci-labs/nodes-lib/node";
import type { DriveObject } from "@desci-labs/desci-models";
import { ResearchObjectComponentDocumentSubtype } from "@desci-labs/desci-models";

/**
 * Convert a path to POSIX format (forward slashes).
 * This ensures consistent path comparison across platforms.
 */
function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Normalize a path by removing root/ or /root/ prefix and converting to POSIX.
 */
function normalizePath(path: string): string {
  let normalized = toPosixPath(path);
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  if (normalized.startsWith("root/")) {
    normalized = normalized.slice(5);
  }
  if (normalized === "root") {
    normalized = "";
  }
  return normalized;
}

/**
 * Normalize the target path for consistent comparisons.
 * Returns the target without leading root/ or trailing slashes.
 */
function normalizeTarget(target: string): string {
  let normalized = normalizePath(target);
  // Remove trailing slash if present
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Collect all file paths from a drive tree (normalized without root/ prefix).
 * Optionally filter to only paths within a specific target scope.
 *
 * @param items - The drive tree items to collect from
 * @param prefix - Current path prefix for recursion
 * @param targetScope - If provided, only collect paths that start with this prefix
 * @returns Set of normalized file paths
 */
function collectRemotePaths(
  items: DriveObject[],
  prefix = "",
  targetScope?: string,
): Set<string> {
  const paths = new Set<string>();
  let normalizedScope: string | undefined;
  if (targetScope) {
    normalizedScope = normalizeTarget(targetScope);
  }

  for (const item of items) {
    let itemPath = item.path;
    if (!itemPath) {
      if (prefix) {
        itemPath = `${prefix}/${item.name}`;
      } else {
        itemPath = item.name;
      }
    }
    itemPath = normalizePath(itemPath);

    if (item.type === "file") {
      // Only include if within target scope (or no scope specified)
      if (!normalizedScope || itemPath.startsWith(normalizedScope + "/") || itemPath === normalizedScope) {
        paths.add(itemPath);
      }
    } else if (item.type === "dir" && item.contains) {
      const dirPrefix = itemPath;
      for (const p of collectRemotePaths(item.contains, dirPrefix, targetScope)) {
        paths.add(p);
      }
    }
  }
  return paths;
}

/**
 * Get the default ignore patterns for file collection.
 * @param includeHidden - If true, don't ignore hidden files (except .git)
 */
function getIgnorePatterns(includeHidden: boolean): string[] {
  const patterns = ["**/node_modules/**", "**/.git/**", "**/.DS_Store"];
  if (!includeHidden) {
    // Ignore all hidden files and directories (starting with .)
    patterns.push("**/.*", "**/.*/**");
  }
  return patterns;
}

/**
 * Collect local file paths relative to a folder (POSIX-normalized).
 * @param folderPath - The folder to collect files from
 * @param includeHidden - If true, include hidden files (default: false)
 */
async function collectLocalPaths(
  folderPath: string,
  includeHidden = false,
): Promise<Set<string>> {
  const files = await glob("**/*", {
    cwd: folderPath,
    nodir: true,
    ignore: getIgnorePatterns(includeHidden),
    dot: includeHidden,
  });
  // Normalize all paths to POSIX format for cross-platform consistency
  return new Set(files.map(toPosixPath));
}

/**
 * Map a local relative path to its full remote path under the target prefix.
 * @param localPath - The local file path relative to source folder (POSIX)
 * @param target - The target path in the node (e.g., "root" or "root/data")
 * @returns The full remote path (normalized, without root/ prefix)
 */
function localToRemotePath(localPath: string, target: string): string {
  const normalizedTarget = normalizeTarget(target);
  const posixLocal = toPosixPath(localPath);
  
  if (!normalizedTarget || normalizedTarget === "") {
    return posixLocal;
  }
  return `${normalizedTarget}/${posixLocal}`;
}

// Find the first PDF file in a drive tree
interface PdfInfo {
  name: string;
  path: string;
  cid: string;
}

function findFirstPdf(items: DriveObject[], prefix = ""): PdfInfo | null {
  for (const item of items) {
    let itemPath = item.path;
    if (!itemPath) {
      if (prefix) {
        itemPath = `${prefix}/${item.name}`;
      } else {
        itemPath = `root/${item.name}`;
      }
    }
    
    if (item.type === "file" && item.name.toLowerCase().endsWith(".pdf")) {
      return {
        name: item.name,
        path: itemPath,
        cid: item.cid,
      };
    }
    
    if (item.type === "dir" && item.contains) {
      const found = findFirstPdf(item.contains, itemPath);
      if (found) return found;
    }
  }
  return null;
}

export function createPushCommand(): Command {
  return new Command("push")
    .description(
      "Push a folder or files to a DeSci node (overwrites existing files)",
    )
    .argument("[path]", "Path to folder or file(s) to upload", ".")
    .option("-n, --node <uuid>", "Target node UUID")
    .option("-t, --target <path>", "Target path in node drive", "root")
    .option("--new", "Create a new node for this upload")
    .option("--title <title>", "Title for new node")
    .option(
      "--clean",
      "Remove remote files that don't exist locally (like rsync --delete)",
    )
    .option("--include-hidden", "Include hidden files (dotfiles) in upload")
    .option("--dry-run", "Show what would be changed without making changes")
    .option("--prepublish", "Prepare node for publishing after upload")
    .option("-y, --yes", "Skip confirmation prompts (for scripted use)")
    .option("-v, --verbose", "Show detailed output")
    .action(async (path: string, options) => {
      try {
        // Check API key
        requireApiKey();

        // Resolve path
        const sourcePath = resolve(process.cwd(), path);
        if (!existsSync(sourcePath)) {
          printError(`Path does not exist: ${sourcePath}`);
          process.exit(1);
        }

        const isDirectory = statSync(sourcePath).isDirectory();
        const itemName = basename(sourcePath);

        console.log(
          `\n${symbols.folder} ${chalk.bold("Source:")} ${chalk.cyan(sourcePath)}`,
        );
        let typeLabel = "File";
        if (isDirectory) {
          typeLabel = "Folder";
        }
        console.log(`${symbols.info} ${chalk.bold("Type:")} ${typeLabel}`);

        if (options.dryRun) {
          console.log(
            chalk.yellow(
              `${symbols.warning} Dry run mode - no changes will be made`,
            ),
          );
        }
        console.log();

        let targetUuid = options.node;
        let isNewNode = false;

        // Create new node or select existing
        if (options.new) {
          // Explicit --new flag: create a new node
          const result = await createNodeInteractive({
            defaultTitle: options.title || itemName,
            dryRun: options.dryRun,
          });
          if (!result) {
            // Dry run - exit after logging
            process.exit(0);
          }
          targetUuid = result.uuid;
          isNewNode = true;
        } else if (!targetUuid) {
          // No UUID provided: show picker with "Create new" option
          const selectedUuid = await resolveNodeUuid(undefined, {
            selectMessage: "Select a node to push to:",
            allowCreate: true,
            noNodesMessage: "No nodes found.",
          });

          if (selectedUuid === "__new__") {
            // User chose to create a new node
            const result = await createNodeInteractive({
              defaultTitle: itemName,
              dryRun: options.dryRun,
            });
            if (!result) {
              // Dry run - exit after logging
              process.exit(0);
            }
            targetUuid = result.uuid;
            isNewNode = true;
          } else {
            targetUuid = selectedUuid;
          }
        }

        // Verify node exists and get current state
        const spinner = createSpinner("Checking node...");
        spinner.start();

        let node;
        let remotePaths = new Set<string>();

        try {
          node = await getDraftNode(targetUuid);
          spinner.text = "Analyzing current files...";

          // Get current file tree if updating existing node
          // Only collect paths within the target scope for accurate comparison
          if (!isNewNode && isDirectory) {
            try {
              const { tree } = await retrieveDraftFileTree(targetUuid);
              remotePaths = collectRemotePaths(tree, "", options.target);
            } catch (err) {
              // Node might be empty, that's ok - but log in verbose mode
              if (options.verbose) {
                console.log(chalk.dim(`\n[verbose] Could not fetch file tree: ${getErrorMessage(err)}`));
              }
            }
          }

          let statusLabel = chalk.yellow("(updating)");
          if (isNewNode) {
            statusLabel = chalk.green("(new)");
          }
          spinner.succeed(`Target: ${chalk.cyan(node.title)} ${statusLabel}`);
        } catch {
          spinner.fail(`Node not found: ${targetUuid}`);
          process.exit(1);
        }

        // Analyze changes if updating a directory
        const filesToDelete: string[] = [];
        let localPaths = new Set<string>();

        if (isDirectory && !isNewNode) {
          localPaths = await collectLocalPaths(sourcePath, options.includeHidden);

          // Map local paths to their full remote paths under the target prefix
          const localToRemoteMap = new Map<string, string>();
          for (const localPath of localPaths) {
            const remotePath = localToRemotePath(localPath, options.target);
            localToRemoteMap.set(localPath, remotePath);
          }
          const localAsRemotePaths = new Set(localToRemoteMap.values());

          // Debug output for verbose mode
          if (options.verbose) {
            console.log(chalk.dim("\n[verbose] Local files (as remote paths):"));
            [...localAsRemotePaths]
              .slice(0, 5)
              .forEach((p) => console.log(chalk.dim(`  ${p}`)));
            if (localAsRemotePaths.size > 5)
              console.log(chalk.dim(`  ... and ${localAsRemotePaths.size - 5} more`));

            console.log(chalk.dim("\n[verbose] Remote files (within target scope):"));
            [...remotePaths]
              .slice(0, 5)
              .forEach((p) => console.log(chalk.dim(`  ${p}`)));
            if (remotePaths.size > 5)
              console.log(chalk.dim(`  ... and ${remotePaths.size - 5} more`));
            console.log();
          }

          // Find files to delete (exist remotely within target scope but not in local set)
          const normalizedTarget = normalizeTarget(options.target);
          if (options.clean) {
            for (const remotePath of remotePaths) {
              // Only consider deletion if the remote path is within the target scope
              const isInTargetScope = !normalizedTarget || 
                remotePath.startsWith(normalizedTarget + "/") || 
                remotePath === normalizedTarget;
              
              if (isInTargetScope && !localAsRemotePaths.has(remotePath)) {
                filesToDelete.push(remotePath);
              }
            }
          }

          // Show summary - compare using mapped remote paths
          const newFiles = [...localPaths].filter(
            (p) => !remotePaths.has(localToRemoteMap.get(p)!)
          );
          const updatedFiles = [...localPaths].filter((p) =>
            remotePaths.has(localToRemoteMap.get(p)!)
          );

          console.log();
          console.log(chalk.bold("Changes to be applied:"));
          console.log(`  ${chalk.green("+")} ${newFiles.length} new files`);
          console.log(
            `  ${chalk.yellow("~")} ${updatedFiles.length} files to update/overwrite`,
          );
          if (options.clean) {
            console.log(
              `  ${chalk.red("-")} ${filesToDelete.length} files to delete`,
            );
          }

          if (options.dryRun) {
            console.log();
            if (newFiles.length > 0) {
              console.log(chalk.green("\nNew files:"));
              newFiles
                .slice(0, 10)
                .forEach((f) => console.log(chalk.dim(`  + ${f}`)));
              if (newFiles.length > 10)
                console.log(
                  chalk.dim(`  ... and ${newFiles.length - 10} more`),
                );
            }
            if (updatedFiles.length > 0) {
              console.log(chalk.yellow("\nFiles to overwrite:"));
              updatedFiles
                .slice(0, 10)
                .forEach((f) => console.log(chalk.dim(`  ~ ${f}`)));
              if (updatedFiles.length > 10)
                console.log(
                  chalk.dim(`  ... and ${updatedFiles.length - 10} more`),
                );
            }
            if (filesToDelete.length > 0) {
              console.log(chalk.red("\nFiles to delete:"));
              filesToDelete
                .slice(0, 10)
                .forEach((f) => console.log(chalk.dim(`  - ${f}`)));
              if (filesToDelete.length > 10)
                console.log(
                  chalk.dim(`  ... and ${filesToDelete.length - 10} more`),
                );
            }
            console.log(chalk.dim("\nRun without --dry-run to apply changes."));
            process.exit(0);
          }
        }

        // Delete remote files that don't exist locally (if --clean)
        if (filesToDelete.length > 0 && !options.dryRun) {
          // Show warning and require confirmation before deleting files
          console.log(
            chalk.yellow(`\n${symbols.warning} ${filesToDelete.length} remote file(s) will be deleted:`),
          );
          filesToDelete
            .slice(0, 5)
            .forEach((f) => console.log(chalk.red(`  - ${f}`)));
          if (filesToDelete.length > 5) {
            console.log(chalk.dim(`  ... and ${filesToDelete.length - 5} more`));
          }
          console.log();

          let confirmDelete = options.yes;
          if (!options.yes) {
            confirmDelete = await confirm({
              message: `Delete ${filesToDelete.length} file(s) from remote node?`,
              default: false,
            });
          }

          if (!confirmDelete) {
            console.log(chalk.dim("Skipping file deletions. Continuing with upload..."));
          } else {
            const deleteSpinner = createSpinner(
              `Removing ${filesToDelete.length} old files...`,
            );
            deleteSpinner.start();

            let deleted = 0;
            let deleteFailed = 0;
            const failedDeletes: string[] = [];

            for (const filePath of filesToDelete) {
              try {
                await deleteData({ uuid: targetUuid, path: `root/${filePath}` });
                deleted++;
                deleteSpinner.text = `Removing old files... (${deleted}/${filesToDelete.length})`;
              } catch (err) {
                // File might already be deleted or have problematic characters
                deleteFailed++;
                failedDeletes.push(filePath);
                if (options.verbose) {
                  console.log(chalk.yellow(`\n  Warning: Failed to delete ${filePath}: ${getErrorMessage(err)}`));
                }
              }
            }

            if (deleteFailed > 0) {
              deleteSpinner.warn(`Removed ${deleted} files, ${deleteFailed} failed to delete`);
              if (!options.verbose && failedDeletes.length > 0) {
                console.log(chalk.dim("  Use --verbose to see which files failed"));
              }
            } else {
              deleteSpinner.succeed(`Removed ${deleted} old files`);
            }
          }
        }

        // Upload files
        console.log();
        const uploadSpinner = createSpinner("Uploading files...");
        uploadSpinner.start();

        const startTime = Date.now();

        try {
          if (isDirectory) {
            // Get list of local files
            const files = await glob("**/*", {
              cwd: sourcePath,
              nodir: true,
              absolute: true,
              ignore: getIgnorePatterns(options.includeHidden),
              dot: options.includeHidden,
            });

            if (files.length === 0) {
              uploadSpinner.fail(`No files found in folder: ${sourcePath}`);
              process.exit(1);
            }

            // Group files by their relative directory (POSIX-normalized for consistency)
            const filesByDir: Record<string, string[]> = {};
            for (const file of files) {
              const relPathRaw = relative(sourcePath, file);
              // Normalize to POSIX format to ensure consistent directory detection
              const relPath = toPosixPath(relPathRaw);
              const dir = relPath.includes("/")
                ? relPath.substring(0, relPath.lastIndexOf("/"))
                : "";
              const key = dir || ".";
              if (!filesByDir[key]) filesByDir[key] = [];
              filesByDir[key].push(file);
            }

            // Create folders first
            const dirs = Object.keys(filesByDir).sort();
            for (const dir of dirs) {
              if (dir !== ".") {
                // dirs are already POSIX-normalized, safe to split on "/"
                const parts = dir.split("/");
                let currentPath = options.target;
                for (const part of parts) {
                  try {
                    await createNewFolder({
                      uuid: targetUuid,
                      contextPath: currentPath,
                      newFolderName: part,
                    });
                  } catch {
                    // Folder might already exist
                  }
                  currentPath = `${currentPath}/${part}`;
                }
              }
            }

            // Upload files
            let uploadedCount = 0;
            let failedCount = 0;
            const failedFiles: string[] = [];

            for (const dir of dirs) {
              const dirFiles = filesByDir[dir];
              // dir is already POSIX-normalized from the grouping above
              let uploadPath = options.target;
              if (dir !== ".") {
                uploadPath = `${toPosixPath(options.target)}/${dir}`;
              }

              for (const file of dirFiles) {
                const fileNameRaw = relative(sourcePath, file);
                // Normalize to POSIX for consistent display and comparison
                const fileName = toPosixPath(fileNameRaw);
                uploadSpinner.text = `Uploading ${chalk.cyan(fileName)} (${uploadedCount + 1}/${files.length})`;

                try {
                  // Check if file exists and delete it first (for overwrite)
                  // Map local path to its full remote path for accurate comparison
                  const fileRemotePath = localToRemotePath(fileName, options.target);
                  if (remotePaths.has(fileRemotePath)) {
                    try {
                      await deleteData({ uuid: targetUuid, path: `root/${fileRemotePath}` });
                    } catch {
                      // Continue even if delete fails
                    }
                  }
                  
                  await uploadFiles({
                    uuid: targetUuid,
                    contextPath: uploadPath,
                    files: [file],
                  });
                } catch (err) {
                  // Track failure but continue with other files
                  failedCount++;
                  failedFiles.push(fileName);
                  if (options.verbose) {
                    console.log(chalk.yellow(`\n  Warning: Failed to upload ${fileName}`));
                  }
                }

                uploadedCount++;
              }
            }

            // Report results based on success/failure
            const duration = Date.now() - startTime;
            const successCount = uploadedCount - failedCount;

            if (failedCount > 0) {
              uploadSpinner.fail(
                `Upload completed with errors: ${successCount}/${uploadedCount} files succeeded, ${failedCount} failed (${Math.round(duration / 1000)}s)`,
              );
              if (options.verbose && failedFiles.length > 0) {
                console.log(chalk.red("\nFailed files:"));
                failedFiles.slice(0, 10).forEach((f) => console.log(chalk.dim(`  ✗ ${f}`)));
                if (failedFiles.length > 10) {
                  console.log(chalk.dim(`  ... and ${failedFiles.length - 10} more`));
                }
              }
              process.exitCode = 1;
            } else {
              uploadSpinner.succeed(
                `Upload complete: ${successCount} files in ${Math.round(duration / 1000)}s`,
              );
            }
          } else {
            // Single file upload
            try {
              await uploadFiles({
                uuid: targetUuid,
                contextPath: options.target,
                files: [sourcePath],
              });
              const duration = Date.now() - startTime;
              uploadSpinner.succeed(
                `Upload complete in ${Math.round(duration / 1000)}s`,
              );
            } catch (err) {
              const duration = Date.now() - startTime;
              uploadSpinner.fail(
                `Upload failed after ${Math.round(duration / 1000)}s`,
              );
              process.exitCode = 1;
            }
          }

          // Auto-assign first PDF as preprint/manuscript component
          try {
            const { tree } = await retrieveDraftFileTree(targetUuid);
            const firstPdf = findFirstPdf(tree);
            
            if (firstPdf) {
              const pdfSpinner = createSpinner("Setting up PDF as preprint...");
              pdfSpinner.start();
              
              try {
                await addPdfComponent(targetUuid, {
                  name: firstPdf.name.replace(/\.pdf$/i, ""),
                  pathToFile: firstPdf.path,
                  cid: firstPdf.cid,
                  subtype: ResearchObjectComponentDocumentSubtype.PREPRINT,
                  starred: true,
                });
                pdfSpinner.succeed(`Set "${firstPdf.name}" as preprint`);
              } catch (pdfErr) {
                // Component might already exist, that's ok
                pdfSpinner.warn(`Could not set PDF component (may already exist)`);
                if (options.verbose) {
                  console.log(chalk.dim(`  ${getErrorMessage(pdfErr)}`));
                }
              }
            }
          } catch (treeErr) {
            // Failed to get tree after upload - this indicates a problem
            printError(`Failed to retrieve file tree after upload: ${getErrorMessage(treeErr)}`);
            console.log(chalk.dim("  The upload may have partially completed."));
            process.exitCode = 1;
          }

          // Prepublish if requested
          if (options.prepublish) {
            const prepubSpinner = createSpinner("Preparing for publish...");
            prepubSpinner.start();

            try {
              const prepubResult = await prePublishDraftNode(targetUuid);
              prepubSpinner.succeed("Node prepared for publishing");
              console.log(
                `${symbols.info} Updated CID: ${chalk.dim(prepubResult.updatedManifestCid)}`,
              );
            } catch {
              prepubSpinner.fail("Prepublish failed");
            }
          }

          if (options.prepublish) {
            printSuccess(
              isNewNode
                ? "Node created and new version prepared!"
                : "Node updated to new version!",
            );
          } else {
            let completionMsg = "Draft updated!";
            if (isNewNode) {
              completionMsg = "Node created and files uploaded!";
            }
            printSuccess(completionMsg);
            console.log(
              chalk.yellow(`\n${symbols.warning} Changes are in draft state.`),
            );
            console.log(
              chalk.dim(
                "   To finalize as a new version, use --prepublish flag or run publish command",
              ),
            );
          }

          const { webUrl } = getEnvConfig();
          console.log(chalk.dim("\nNext steps:"));
          console.log(
            chalk.dim(
              `  • View in browser:  ${webUrl}/node/${targetUuid}`,
            ),
          );
          console.log(
            chalk.dim(
              `  • Pull files:       nodes-cli pull ${targetUuid.slice(0, 8)}`,
            ),
          );
          console.log(
            chalk.dim(
              `  • Publish node:     nodes-cli publish ${targetUuid.slice(0, 8)}`,
            ),
          );
        } catch (err) {
          uploadSpinner.fail("Upload failed");
          throw err;
        }
      } catch (error: unknown) {
        printError(`Push failed: ${getErrorMessage(error)}`);
        process.exit(1);
      }
    });
}

