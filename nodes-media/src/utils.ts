import { PUBLIC_IPFS_PATH } from './config/index.js';
import * as yauzl from 'yauzl';
import { logger } from './logger.js';
import { err, ok } from 'neverthrow';
import type { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

export const cleanupManifestUrl = (url: string, gateway?: string) => {
  if (url && (PUBLIC_IPFS_PATH || gateway)) {
    const s = url.split('/');
    const res = `${gateway ? gateway : PUBLIC_IPFS_PATH}/${s[s.length - 1]}`;
    console.log(`resolving ${url} => ${res}`);
    return res;
  }
  return url;
};

export const parseMystImportGithubUrl = (url: string) => {
  try {
    const matchList = url.match(/github.com[\/:]([^\/]+)\/([^\/^.]+)\/blob\/([^\/^.]+)\/(.+)/);
    logger.debug({ matchList }, 'MYST::matchList');
    if (!matchList) {
      return err(new Error('Invalid github URL'));
    }

    const [, author, repo, branch, contentPath] = matchList as RegExpMatchArray;
    logger.debug({ author, repo, branch, contentPath }, 'MYST::Regex');

    const archiveDownloadUrl = `https://github.com/${author}/${repo}/archive/refs/heads/${branch}.zip`;

    return ok({ author, repo, branch, archiveDownloadUrl });
  } catch (error) {
    return err(new Error('Failed to parse github URL', { cause: error }));
  }
};

export async function calculateTotalZipUncompressedSize(zipPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let totalSize = 0;

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) reject(err);

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        if (!entry.isDirectory) {
          totalSize += entry.uncompressedSize;
        }
        zipfile.readEntry();
      });

      zipfile.on('end', () => {
        resolve(totalSize);
        zipfile.close();
      });

      zipfile.on('error', (err) => {
        reject(err);
        zipfile.close(); // Ensure the zipfile is closed even when there's an error
      });
    });
  });
}

// Extracts a zip file to a given path, deletes the zip, and returns the extracted path.
export async function extractZipFileAndCleanup(zipFilePath: string, outputDirectory: string): Promise<string> {
  let extractedPath = '';
  return new Promise((resolve, reject) => {
    yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        // Skip directories
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err) return reject(err);

          // Ensure parent directory exists.
          const filePath = path.join(outputDirectory, entry.fileName);

          const directoryName = path.dirname(filePath);
          fs.mkdirSync(directoryName, { recursive: true });

          // Create write stream.
          const writeStream = fs.createWriteStream(filePath);

          // Pipe readStream to writeStream.
          readStream.on('error', (err) => {
            readStream.destroy(); // Ensure the stream is closed
            reject(err);
          });

          writeStream.on('error', (err) => {
            writeStream.close(); // Ensure the file is closed
            reject(err);
          });
          writeStream.on('finish', () => zipfile.readEntry());

          readStream.pipe(writeStream);
        });
      });

      zipfile.on('end', async () => {
        try {
          // Delete the original zip file.
          await fs.promises.unlink(zipFilePath);
          resolve(extractedPath);
        } catch (error) {
          reject(error);
        }
      });

      zipfile.on('error', reject);
    });
  });
}

export async function zipUrlToStream(url: string): Promise<Readable> {
  const response = await axios.get(url, { responseType: 'stream' });
  return response.data;
}

export async function saveZipStreamToDisk(zipStream: Readable, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Create a writable stream to the output file
    const fileStream = fs.createWriteStream(outputPath);

    // Pipe the ZIP stream into the file stream
    zipStream.pipe(fileStream);
    zipStream.on('error', reject);
    fileStream.on('error', reject);

    fileStream.on('finish', resolve);
  });
}
