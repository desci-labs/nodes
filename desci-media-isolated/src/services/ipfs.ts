import axios from 'axios';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { IpfsConfigurationError, IpfsFetchError } from '../utils/customErrors.js';
import { logger as parentLogger } from '../utils/logger.js';

const IPFS_GATEWAY = process.env.IPFS_GATEWAY;
const logger = parentLogger.child({ module: 'IPFS Service' });

export class IpfsService {
  static async saveFile(cid: string, outputPath: string) {
    if (!IPFS_GATEWAY) {
      logger.info({ IPFS_GATEWAY: process.env.IPFS_GATEWAY }, 'IPFS_GATEWAY');
      throw new IpfsConfigurationError('process.env.IPFS_GATEWAY is not defined in environment variables');
    }
    const url = `${IPFS_GATEWAY}/${cid}`;

    try {
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        timeout: 60000,
      });

      await pipeline(response.data, fs.createWriteStream(outputPath));

      logger.info(`File downloaded and saved to ${outputPath}`);
    } catch (error) {
      logger.error({ error }, 'Error downloading or saving the file');
      throw new IpfsFetchError(`Error downloading or saving the file: ${cid}`);
    }
  }
}
