import multer = require('multer');

/**
 * Used to parse form data fields to req.body, without touching files.
 */
export const parseFormDataFields = multer().none();
