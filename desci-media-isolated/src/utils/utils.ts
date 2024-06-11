import fs from 'fs/promises';

export async function readFileToBuffer(filePath: string) {
  const fileBuffer = await fs.readFile(filePath);
  return fileBuffer;
}

export function startsWithVowel(str: string) {
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const firstChar = str.toLowerCase()[0];
  return vowels.includes(firstChar);
}
