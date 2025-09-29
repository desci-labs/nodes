/**
 * Node.js-specific file upload functions
 * These functions require fs and form-data which are not available in browsers
 */
import FormData from "form-data";
import { createReadStream } from "fs";
import { makeRequest } from "../shared/routes.js";
import { getHeaders } from "../shared/util/headers.js";
import {
  ENDPOINTS,
  type UploadParams,
  type UploadFilesResponse,
} from "../shared/api.js";
import { makeAbsolutePath } from "../shared/util/manifest.js";

/**
 * Upload local files to a node using Node.js fs module
 */
export const uploadFiles = async (
  params: UploadParams,
): Promise<UploadFilesResponse> => {
  const { contextPath, files, uuid } = params;
  const form = new FormData();
  form.append("uuid", uuid);
  form.append("contextPath", makeAbsolutePath(contextPath));
  files.forEach((f) => {
    const stream = createReadStream(f);
    form.append("files", stream);
  });
  return await makeRequest(
    ENDPOINTS.uploadFiles,
    getHeaders(true),
    // Formdata equivalent
    form as unknown as UploadParams,
  );
};
