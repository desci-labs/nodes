import fs from 'fs/promises';

export async function readFileToBuffer(filePath: string) {
  const fileBuffer = await fs.readFile(filePath);
  return fileBuffer;
}
