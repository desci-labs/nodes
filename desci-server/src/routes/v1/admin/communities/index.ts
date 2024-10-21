import { NextFunction, Response, Router } from 'express';
import { Request } from 'express';
import multer from 'multer';
import multerS3 from 'multer-s3';

import {
  addEntryAttestation,
  addMember,
  createAttestation,
  createCommunity,
  listAllCommunities,
  listAttestations,
  listCommunityAttestations,
  listCommunityEntryAttestations,
  removeEntryAttestation,
  removeMember,
  updateAttestation,
  updateCommunity,
} from '../../../../controllers/admin/communities/index.js';
import { asyncHandler, ensureAdmin, ensureUser, logger as parentLogger, validate } from '../../../../internal.js';
import { isS3Configured, s3Client } from '../../../../services/s3.js';

import {
  addAttestationSchema,
  addCommunitySchema,
  addEntryAttestationSchema,
  addMemberSchema,
  removeMemberSchema,
  updateAttestationSchema,
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
  { name: 'image', maxCount: 1 },
  { name: 'verifiedImage', maxCount: 1 },
]);

const wrappedHandler = (req: Request, res: Response, next: NextFunction) => {
  uploadHandler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        logger.error({ err, files: req.files }, 'MulterError encountered');
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
  typeof req.body?.keywords === 'string' ? (req.body.keywords = JSON.parse(req.body.keywords)) : null;
  typeof req.body?.links === 'string' ? (req.body.links = JSON.parse(req.body.links)) : null;
  next();
};

router.get('/', [ensureUser, ensureAdmin], asyncHandler(listAllCommunities));
router.get('/:communityId/attestations', [ensureUser, ensureAdmin], asyncHandler(listCommunityAttestations));
router.get('/:communityId/entryAttestations', [ensureUser, ensureAdmin], asyncHandler(listCommunityEntryAttestations));

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

router.post(
  '/:communityId/attestations',
  [ensureUser, ensureAdmin, wrappedHandler, validate(addAttestationSchema)],
  asyncHandler(createAttestation),
);

router.put(
  '/:communityId/attestations/:attestationId',
  [ensureUser, ensureAdmin, wrappedHandler, validate(updateAttestationSchema)],
  asyncHandler(updateAttestation),
);

router.post('/:communityId/addMember', [ensureUser, ensureAdmin, validate(addMemberSchema)], asyncHandler(addMember));

router.delete(
  '/:communityId/removeMember/:memberId',
  [ensureUser, ensureAdmin, validate(removeMemberSchema)],
  asyncHandler(removeMember),
);

router.post(
  '/:communityId/addEntryAttestation/:attestationId',
  [ensureUser, ensureAdmin, validate(addEntryAttestationSchema)],
  asyncHandler(addEntryAttestation),
);

router.post(
  '/:communityId/removeEntryAttestation/:attestationId',
  [ensureUser, ensureAdmin, validate(addEntryAttestationSchema)],
  asyncHandler(removeEntryAttestation),
);

export default router;
