import { createKuboRPCClient } from "kubo-rpc-client";
import { resolve } from 'path';
import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { minimatch } from 'minimatch';

let client;
try {
  client = createKuboRPCClient('http://localhost:5001');
} catch (error) {
  console.error(`Failed to initialise IPFS client: ${error.message}`);
  console.error('Do you need to tunnel to a remote pod?');
  process.exit(1);
}

async function addFilesToIpfs(directoryPath, globPattern) {
  try {
    const absolutePath = resolve(directoryPath);
    console.log(`Scanning directory ${absolutePath} with pattern: ${globPattern}`);

    const results = {};

    async function scanDirectory(dir) {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          const relativePath = fullPath.replace(absolutePath + '/', '');
          if (minimatch(relativePath, globPattern)) {
            const stats = await stat(fullPath);
            console.log(`Processing: ${relativePath} (${stats.size} bytes)`);

            const content = await readFile(fullPath);
            const file = await client.add({
              content
            }, {
              cidVersion: 1
            });

            results[relativePath] = file.cid.toString();
            console.log(`Added: ${relativePath}`);
          }
        }
      }
    }

    await scanDirectory(absolutePath);

    // Print the results as JSON
    console.log(JSON.stringify(results, null, 2));

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error(`Usage: node upload.js <directory_path> <glob_pattern>`);
  console.error(`Example: node upload.js ./my-files '**/*.{jpg,png}'`);
  console.error(`Example: node upload.js ./documents '**/*' (all files recursively)`);
  process.exit(1);
}

const directoryPath = args[0];
const globPattern = args[1];
console.log('Parsed arugments:', { directoryPath, globPattern })

addFilesToIpfs(directoryPath, globPattern);
