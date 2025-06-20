import { randomBytes, createCipheriv } from 'crypto';
import fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import axios from 'axios';
import { base16 } from 'multiformats/bases/base16';
import { CID } from 'multiformats/cid';
import { encode, decode } from 'url-safe-base64';
import * as yauzl from 'yauzl';

import { logger as parentLogger } from './logger.js';
import { processGithubUrl } from './utils/githubUtils.js';

const logger = parentLogger.child({
  module: 'utils',
});

export const hideEmail = (email: string) => {
  return email.replace(/(.{1,1})(.*)(@.*)/, '$1...$3');
};

export const encodeBase64UrlSafe = (bytes: Buffer) => {
  return encode(Buffer.from(bytes).toString('base64'));
};

export const decodeBase64UrlSafeToHex = (base64safe: string) => {
  const h = Buffer.from(decode(base64safe), 'base64').toString('hex');
  return h.length % 2 == 0 ? h : h.substring(1);
};

export const randomUUID64 = () => {
  const bytes = randomBytes(32);

  const encoded = encodeBase64UrlSafe(bytes);
  logger.debug({ fn: 'randomUUID64' }, `GOT BYTES ${Buffer.from(bytes).toString('hex')} ${encoded}`);
  return encoded;
};

/** Test if a string is a valid, plain-text CID */
export const isCid = (maybeCid: string) => {
  try {
    CID.parse(maybeCid);
    return true;
  } catch (e) {
    return false;
  }
};

export const hexToCid = (hexCid: string) => {
  hexCid = hexCid.substring(2); // remove 0x
  hexCid = hexCid.length % 2 === 0 ? hexCid.substring(1) : hexCid;
  // const cidBytes = Buffer.from(hexCid, 'hex');

  const res2 = base16.decode(hexCid);
  const cid = CID.decode(res2);
  const cidString = cid.toString();

  return cidString;
};

export const convertCidTo0xHex = (cid: string) => {
  const rawHex = CID.parse(cid).toString(base16);
  const paddedAndPrefixed =
    '0x' +
    // left pad to even pairs if odd length
    (rawHex.length % 2 !== 0 ? '0' : '') +
    rawHex;
  return paddedAndPrefixed;
};

export async function asyncMap<T, E>(arr: E[], predicate: (input: E, index: number) => Promise<T>): Promise<T[]> {
  const results = await Promise.all(arr.map((value, index) => predicate(value, index)));

  return results as T[];
}

export function extractManifestCids(manifest: ResearchObjectV1) {
  const cids = [];
  manifest.components.forEach((c) => {
    if (c.type !== ResearchObjectComponentType.DATA && c.payload?.url) cids.push(c.payload.url);
    if (c.type === ResearchObjectComponentType.DATA && c.payload?.cid) cids.push(c.payload.cid);
  });
  return cids;
}

export function ensureUniqueString(string, collisionList) {
  if (collisionList.includes(string)) {
    let i = 1;
    let newString = `${string}${i}`;
    while (collisionList.includes(newString)) {
      i++;
      newString = `${string}${i}`;
    }
    return newString;
  }
  return string;
}

export function bufferToStream(buffer: Buffer): Readable {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

export async function zipUrlToStream(url: string): Promise<Readable> {
  const response = await axios.get(url, { responseType: 'stream' });
  return response.data;
}

export function ensureUuidEndsWithDot(uuid: string): string {
  return uuid.endsWith('.') ? uuid : uuid + '.';
}

export const unpadUuid = (uuid: string): string => uuid.replace('.', '');

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
export async function extractZipFileAndCleanup(zipFilePath: string, outputDirectory: string): Promise<void> {
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
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      zipfile.on('error', reject);
    });
  });
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

export const processExternalUrls = async (
  url: string,
  type: ResearchObjectComponentType | undefined,
): Promise<string | null> => {
  if (type === ResearchObjectComponentType.CODE) {
    if (url.indexOf('github.com') > -1) {
      const { branch, author, repo } = await processGithubUrl(url);
      const newUrl = `https://github.com/${author}/${repo}/archive/refs/heads/${branch}.zip`;
      return newUrl;
    }
  }
  return null;
};

export function arrayXor(arr: any[]): boolean {
  return arr.reduce((acc, val) => acc !== !!val, false);
}

export function objectPropertyXor(obj1: any, obj2: any): any {
  const result: any = {};

  for (const key in obj1) {
    if (!(key in obj2) || !(key in obj1) || obj1[key] !== obj2[key]) {
      result[key] = 1;
    }
  }

  for (const key in obj2) {
    if (!(key in obj1)) {
      result[key] = 1;
    }
  }

  return result;
}

// returns a new object omitting the specified keys in the filter list
export function omitKeys(obj: Record<string, any>, filterList: string[]): Record<string, any> {
  return Object.keys(obj)
    .filter((key) => !filterList.includes(key))
    .reduce((newObj, key) => ({ ...newObj, [key]: obj[key] }), {});
}

/**
 * Accepts either 16 digits or 4 groups of 4 digits separated by hyphens.
 * e.g. 0000-0000-0000-0000
 * or 0000000000000000
 */
export const orcidRegex: RegExp = /^\d{4}-?\d{4}-?\d{4}-?\d{3}[\dX]$/;

/**
 * Converts a non hyphenated orcid ID to hyphenated format.
 */
export function formatOrcidString(orcidId: string): string {
  // Remove any existing hyphens from the input string
  const orcidWithoutHyphens = orcidId.replace(/-/g, '');

  // Insert hyphens at the appropriate positions
  const formattedOrcid = orcidWithoutHyphens.replace(/(\d{4})(\d{4})(\d{4})(\d{3}[\dX])/, '$1-$2-$3-$4');

  return formattedOrcid;
}

export function toKebabCase(name: string) {
  const lowercaseName = name.toLowerCase();

  // Replace spaces, underscores, and dashes with a single dash
  const dashedName = lowercaseName.replace(/[\s_-]+/g, '-');

  // Remove any non-alphanumeric characters except dashes
  const urlSafeName = dashedName.replace(/[^a-z0-9-]/g, '');

  // Remove any leading or trailing dashes
  const trimmedName = urlSafeName.replace(/^-+|-+$/g, '');

  return trimmedName;
}

/*
 ** Used to log sensitive information in a secure way
 */
export const encryptForLog = (text: string, key: string) => {
  const paddedKey = key.padEnd(32, '0');
  const keyBytes = new Uint8Array(Buffer.from(paddedKey));

  const cipher = createCipheriv('aes-256-ecb' as any, keyBytes, null);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
};

/**
 * Prepends an indefinite article to a word.
 * @example "Chief Editor" -> "a Chief Editor"
 * @example "Associate Editor" -> "an Associate Editor"
 */
export const prependIndefiniteArticle = (word: string) => {
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const firstLetter = word.toLowerCase().charAt(0);
  return vowels.includes(firstLetter) ? `an ${word}` : `a ${word}`;
};
