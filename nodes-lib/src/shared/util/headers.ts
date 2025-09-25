import { getNodesLibInternalConfig } from "../config/index.js";

export const getHeaders = (isFormData: boolean = false) => {
  return {
    "api-key": getNodesLibInternalConfig().apiKey,
    ...(isFormData ? { "content-type": "multipart/form-data" } : {}),
  };
};
