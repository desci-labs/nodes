import { Readable } from 'stream';

import { GaxiosResponse } from 'gaxios';
import { google, drive_v3 } from 'googleapis';

import { logger as parentLogger } from '../logger.js';

export class GoogleApiService {
  private driveClient: drive_v3.Drive;
  private logger;

  constructor(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    this.driveClient = google.drive({ version: 'v3', auth: oauth2Client });
    this.logger = parentLogger.child({ module: 'Services::GoogleApiService' });
  }

  async getFileMetadata(docId: string): Promise<GaxiosResponse<drive_v3.Schema$File>> {
    try {
      const fileMetadata = await this.driveClient.files.get({ fileId: docId });

      return fileMetadata as GaxiosResponse<drive_v3.Schema$File>;
    } catch (error) {
      this.logger.error({ docId, error }, 'Failed to get file metadata');
      throw error;
    }
  }

  async getFileStream(docId: string): Promise<Readable> {
    try {
      const response = await this.driveClient.files.get({ fileId: docId, alt: 'media' }, { responseType: 'stream' });

      return response.data;
    } catch (error) {
      this.logger.error({ docId, error }, 'Failed to get file stream');
      throw error;
    }
  }
}
