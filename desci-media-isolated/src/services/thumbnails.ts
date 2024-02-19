import { generateAsync } from 'filepreview_ts';
import { TEMP_DIR, THUMBNAIL_FILES_DIR, THUMBNAIL_OUTPUT_DIR } from '../config';
import { IpfsService } from './ipfs';
import { UnhandledError } from '../utils/customErrors';
import path from 'path';
import fs from 'fs';

const THUMBNAIL_DIMENSIONS = {
  width: 220,
  height: 300,
};
const BASE_TEMP_DIR = path.resolve(__dirname, '..', TEMP_DIR);

export class ThumbnailsService {
  static async generateThumbnail(cid: string) {
    const tempFilePath = path.join(BASE_TEMP_DIR, THUMBNAIL_FILES_DIR, `${cid}`);
    const thumbnailPath = this.getThumbnailPath(cid);
    const exportPath = path.join(BASE_TEMP_DIR, THUMBNAIL_OUTPUT_DIR, thumbnailPath);

    await IpfsService.saveFile(cid, tempFilePath);
    try {
      await generateAsync(tempFilePath, exportPath, THUMBNAIL_DIMENSIONS);
      return thumbnailPath;
    } catch (e) {
      console.error(e);
      throw new UnhandledError(`Failed generating thumbnail for file with cid: ${cid}`);
    } finally {
      // The initially saved file is removed, however the thumbnail remains. Further cleanup can be done for the thumbnail.
      try {
        await fs.unlink(tempFilePath, (err) => {
          if (err) {
            console.error(err, `Failed to cleanup temporary file: ${tempFilePath}`);
            return;
          }
          console.log(`Temporary file ${tempFilePath} deleted successfully.`);
        });
      } catch (cleanupError) {
        console.error(`Failed to delete temporary file ${tempFilePath}:`, cleanupError);
      }
    }
  }

  static getThumbnailPath(cid: string) {
    return `${THUMBNAIL_DIMENSIONS.width}x${THUMBNAIL_DIMENSIONS.height}_${cid}`;
  }
}
