import { Request } from 'express';
import multer = require('multer');
import multerS3 from 'multer-s3';
import { v4 } from 'uuid';

import { logger } from '../logger.js';
import { isS3Configured, s3Client } from '../services/s3.js';

import { ensureWriteAccessCheck } from './authorisation.js';

const upload = isS3Configured
  ? multer({
      fileFilter: async (req, file, cb) => {
        // Ensure write access before uploading
        if (!(req as any).node) {
          const user = (req as any).user;
          const { ok, node } = await ensureWriteAccessCheck(user, (req as any).body.uuid);
          if (ok) {
            (req as any).node = node;
          } else {
            cb(new Error('unauthorized'));
            return;
          }
        }
        // accept the files
        cb(null, true);
      },
      preservePath: true,
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_S3_BUCKET_NAME,
        key: (req, file, cb) => {
          const userId = (req as any).user.id;
          const { uuid, contextPath } = (req as any).body;
          if (!uuid || !contextPath || !userId) {
            cb(new Error('Missing required params to form key'));
          }
          const key = `${userId}*${uuid}/${v4()}`; // adjust for dir uploads, doesn't start with '/'
          cb(null, key);
        },
      }),
    })
  : multer({ preservePath: true });

export const uploadHandler = upload.array('files');

export const wrappedHandler = (req, res, next) => {
  uploadHandler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        throw err;
      } else {
        res.status(401).send({ msg: 'unauthorized' });
        return;
      }
    }
    next();
  });
};

// Specialized upload handler for myst imports that uses req.node and req.user from ensureJobInfo
const mystUpload = isS3Configured
  ? multer({
      fileFilter: async (req, file, cb) => {
        // Use data from ensureJobInfo instead of req.body
        if (!(req as any).node || !(req as any).user) {
          cb(new Error('Missing node or user information'));
          return;
        }
        // accept the files
        cb(null, true);
      },
      preservePath: true,
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_S3_BUCKET_NAME,
        key: (req, file, cb) => {
          const userId = (req as any).user?.id;
          const uuid = (req as any).node?.uuid;
          if (!uuid || !userId) {
            cb(new Error('Missing required params to form key'));
            return;
          }
          const key = `${userId}*${uuid}/${v4()}`; // adjust for dir uploads, doesn't start with '/'
          cb(null, key);
        },
      }),
    })
  : multer({ preservePath: true });

export const mystUploadHandler = mystUpload.array('files');

export const mystWrappedHandler = (req, res, next) => {
  mystUploadHandler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        throw err;
      } else {
        res.status(401).send({ msg: 'unauthorized' });
        return;
      }
    }
    next();
  });
};
