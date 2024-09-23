import { NextFunction, Response, Router } from 'express';
import { Request } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';

import {
  createCommunity,
  listAllCommunities,
  todoApi,
  updateCommunity,
} from '../../../../controllers/admin/communities/index.js';
import { asyncHandler, ensureAdmin, ensureUser, logger as parentLogger, validate } from '../../../../internal.js';
import { isS3Configured, s3Client } from '../../../../services/s3.js';

import {
  addAttestationSchema,
  addCommunitySchema,
  addEntryAttestationSchema,
  addMemberSchema,
  removeEntryAttestationSchema,
  removeMemberSchema,
  updateCommunitySchema,
} from './schema.js';

const logger = parentLogger.child({ module: 'Admin/communities' });
const router = Router();

const upload = isS3Configured
  ? multer({
      preservePath: true,
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_S3_BUCKET_NAME,
        key: (req, file, cb) => {
          // const userId = (req as any).user.id;
          const { name, communitySlug } = (req as any).body;
          if (!name || !name) {
            cb(new Error('Missing required params to form key'));
          }
          const key = `${communitySlug}${name ? +'/' + name : ''}/${file.filename}`; // adjust for dir uploads, doesn't start with '/'
          logger.info({ fileName: key }, 'Upload asset');
          cb(null, key);
        },
      }),
    })
  : multer({ preservePath: true });

const uploadHandler = upload.fields([
  { name: 'imageUrl', maxCount: 1 },
  { name: 'verifiedImageUrl', maxCount: 1 },
]);

const wrappedHandler = (req: Request, res: Response, next: NextFunction) => {
  uploadHandler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        throw err;
      } else {
        logger.error({ err }, 'Upload Handler Error encountered');
        res.status(401).send({ msg: 'unauthorized' });
        return;
      }
    }
    next();
  });
};

const sanitizeBody = async (req: Request, _res: Response, next: NextFunction) => {
  logger.info({ body: req.body }, 'sanitizeBody');
  req.body?.keywords ? (req.body.keywords = JSON.parse(req.body.keywords)) : null;
  req.body?.links ? (req.body.links = JSON.parse(req.body.links)) : null;
  next();
};

router.get('/', [ensureUser, ensureAdmin], asyncHandler(listAllCommunities));

router.post(
  '/',
  [ensureUser, ensureAdmin, wrappedHandler, sanitizeBody, validate(addCommunitySchema)],
  asyncHandler(createCommunity),
);

router.put(
  '/:communityId',
  [ensureUser, ensureAdmin, wrappedHandler, sanitizeBody, validate(updateCommunitySchema)],
  asyncHandler(updateCommunity),
);

// todo: api to create attestation for desci community ( with option to add it as an entryAttestation)
router.post(
  '/:communityId/attestations',
  [ensureUser, ensureAdmin, validate(addAttestationSchema), wrappedHandler],
  asyncHandler(todoApi),
);

// todo: api to add a desci community member
router.post(':communityId/members', [ensureUser, ensureAdmin, validate(addMemberSchema)], asyncHandler(todoApi));

// todo: api to remove a desci community member
router.delete(
  '/:communityId/members/:memberId',
  [ensureUser, ensureAdmin, validate(removeMemberSchema)],
  asyncHandler(todoApi),
);

// todo: api to link attestation to community (this adds it to the communityEntryAttestation)
router.post(
  '/:communityId/addEntryAttestation',
  [ensureUser, ensureAdmin, validate(addEntryAttestationSchema)],
  asyncHandler(todoApi),
);

// todo: api to remove attestation as required in for community (remove communityEntryAttestation)
router.post(
  '/:communityId/removeEntryAttestation',
  [ensureUser, ensureAdmin, validate(removeEntryAttestationSchema)],
  asyncHandler(todoApi),
);

export default router;
