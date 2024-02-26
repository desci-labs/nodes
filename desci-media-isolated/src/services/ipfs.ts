import axios from 'axios';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { IpfsConfigurationError } from '../utils/customErrors.js';

const IPFS_GATEWAY = process.env.IPFS_GATEWAY;
export class IpfsService {
  static async saveFile(cid: string, outputPath: string) {
    if (!IPFS_GATEWAY) {
      console.log('IPFS_GATEWAY:', process.env.IPFS_GATEWAY);
      throw new IpfsConfigurationError('process.env.IPFS_GATEWAY is not defined in environment variables');
    }
    // debugger;
    const url = `${IPFS_GATEWAY}/${cid}`;

    try {
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream',
        timeout: 60000,
      });

      await pipeline(response.data, fs.createWriteStream(outputPath));

      console.log(`File downloaded and saved to ${outputPath}`);
    } catch (error) {
      console.error('Error downloading or saving the file:', error);
      throw error;
    }
  }
}
