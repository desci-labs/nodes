import { Readable } from 'stream';

import { GaxiosResponse } from 'gaxios';
import { google, drive_v3 } from 'googleapis';

import { logger as parentLogger } from '../logger.js';

export class GoogleApiService {
  private oauth2Client;
  private driveClient: drive_v3.Drive;
  private logger;

  constructor(accessToken: string) {
    this.oauth2Client = new google.auth.OAuth2({
      clientId: process.env.GOOGLE_CLIENT_ID,
      // clientSecret: process.env.GOOGLE_CLIENT_SECRET, Unnecessary unless we switch to 2step server-side OAuth flow
    });
    this.oauth2Client.setCredentials({ access_token: accessToken });
    this.driveClient = google.drive({ version: 'v3', auth: this.oauth2Client });
    this.logger = parentLogger.child({ module: 'Services::GoogleApiService' });
  }

  async getFileMetadata(docId: string): Promise<drive_v3.Schema$File> {
    try {
      const fileMetadata = await this.driveClient.files.get({ fileId: docId, fields: 'id, name, mimeType, size' });

      return fileMetadata.data;
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

  async authenticateWithAccessToken(accessToken: string): Promise<void> {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      this.logger.info('Successfully authenticated with access token');
    } catch (error) {
      this.logger.error({ error }, 'Failed to authenticate with access token');
      throw error;
    }
  }

  /**
   * Can be used later if we switch to 2-step, server-side OAuth flow, useful if we need >60 minutes of access.
   */
  async exchangeCodeForToken(code: string): Promise<void> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      debugger;
      this.oauth2Client.setCredentials(tokens);
      this.logger.info('Successfully exchanged code for tokens');
    } catch (error) {
      this.logger.error({ error }, 'Failed to exchange code for tokens');
      throw error;
    }
  }
}
