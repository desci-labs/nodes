import { User } from '@prisma/client';
import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import z from 'zod';

import { prisma } from '../../client.js';
import { NotFoundError } from '../../core/ApiError.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { emailRegex } from '../../core/helper.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { exportMarketingConsentSchema } from '../../schemas/users.schema.js';
import { getUsersWithMarketingConsent, getUsersWithSciweaveMarketingConsent } from '../../services/user.js';
import { formatOrcidString, orcidRegex } from '../../utils.js';

export type SearchProfilesRequest = Request<never, never, never, { name?: string; orcid?: string }> & {
  user: User; // added by auth middleware
};

export type SearchProfilesResBody =
  | {
      profiles: UserProfile[];
    }
  | {
      error: string;
    };

export type UserProfile = { name: string; id: number; orcid?: string; organisations?: string[] };

const userSearchSchema = z.object({
  query: z.object({
    page: z.coerce.number().optional().default(0),
    cursor: z.coerce.number().optional().default(1),
    limit: z.coerce.number().optional().default(20),
    search: z.string().optional().default(''),
  }),
});

export const searchUserProfiles = async (req: SearchProfilesRequest, res: Response<SearchProfilesResBody>) => {
  // debugger;
  const user = req.user;
  const { name } = req.query;
  let { orcid } = req.query;
  const logger = parentLogger.child({
    module: 'Users::searchProfiles',
    body: req.body,
    userId: user.id,
    name,
    orcid,
    queryType: orcid ? 'orcid' : 'name',
  });

  const {
    query: { page, limit, cursor, search },
  } = await userSearchSchema.parseAsync(req);

  logger.trace({ page, cursor, limit, search });

  const count = await prisma.user.count({});
  //   const users = await prisma.user.findMany({ cursor: { id: cursor }, skip: page * limit, take: limit });
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, orcid: true, isAdmin: true, createdAt: true },
  });

  new SuccessResponse({ cursor: users[users.length - 1].id, page, count, data: users }).send(res);
  return;

  if (orcid && orcidRegex.test(orcid) === false)
    throw new NotFoundError('Invalid orcid id, orcid must follow either 123456780000 or 1234-4567-8000-0000 format.');
  // return res
  //   .status(400)
  //   .json({ error: 'Invalid orcid id, orcid must follow either 123456780000 or 1234-4567-8000-0000 format.' });

  if (orcid) orcid = formatOrcidString(orcid); // Ensure hyphenated

  if (name?.toString().length < 2 && !orcid) throw new NotFoundError('Name query must be at least 2 characters');
  // return res.status(400).json({ error: 'Name query must be at least 2 characters' });

  //   try {
  const isEmail = emailRegex.test(name);
  let emailMatches = [];
  if (isEmail) {
    emailMatches = await prisma.user.findMany({
      where: {
        email: {
          mode: 'insensitive',
          equals: name as string,
        },
      },
      include: { userOrganizations: { include: { organization: { select: { name: true } } } } },
    });
  }

  const profiles = orcid
    ? await prisma.user.findMany({
        where: { orcid: orcid },
        include: { userOrganizations: { include: { organization: { select: { name: true } } } } },
      })
    : await prisma.user.findMany({
        where: { name: { contains: name as string, mode: 'insensitive', not: null } },
        include: { userOrganizations: { include: { organization: { select: { name: true } } } } },
      });

  // logger.info({ profiles }, 'PROFILES');
  if (profiles || emailMatches) {
    const profilesReturn: UserProfile[] = [...emailMatches, ...profiles].map((profile) => ({
      name: profile.name,
      id: profile.id,
      organisations: profile.userOrganizations.map((org) => org.organization.name),
      ...(profile.orcid && { orcid: profile.orcid }),
    }));
    //   return res.status(200).json({ profiles: profilesReturn });
    new SuccessResponse({ profiles: profilesReturn });
  } else {
    new SuccessResponse({ profiles: [] });
  }
  //   }
  //   catch (e) {
  //     logger.error({ e }, 'Failed to search for profiles');
  //     return res.status(500).json({ error: 'Search failed' });
  //   }

  //   return res.status(500).json({ error: 'Something went wrong' });
};

export type ExportMarketingConsentRequest = ValidatedRequest<typeof exportMarketingConsentSchema, AuthenticatedRequest>;
export const getMarketingConsentUsersCsv = async (req: ExportMarketingConsentRequest, res: Response) => {
  const user = req.user;
  const logger = parentLogger.child({
    module: 'Users::getMarketingConsentUsersCsv',
    userId: user.id,
  });

  logger.info({ fn: 'getMarketingConsentUsersCsv' }, `GET getMarketingConsentUsersCsv called by ${user.email}`);

  try {
    // Get validated query parameters
    const format = req.validatedData.query.format;
    const users = await getUsersWithMarketingConsent();

    if (format === 'xlsx') {
      // Create Excel workbook
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(users.map((user) => ({ email: user.email })));

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Marketing Consent Users');

      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-disposition', 'attachment; filename=marketing-consent-emails.xlsx');
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.status(200).send(excelBuffer);
    } else {
      // Default CSV format
      const csv = ['email', ...users.map((user) => user.email)].join('\n');

      res.setHeader('Content-disposition', 'attachment; filename=marketing-consent-emails.csv');
      res.set('Content-Type', 'text/csv');
      res.status(200).send(csv);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to export marketing consent users');
    res.status(500).json({ error: 'Failed to export marketing consent users' });
  }
};

export const getSciweaveMarketingConsentUsersCsv = async (req: ExportMarketingConsentRequest, res: Response) => {
  const user = req.user;
  const logger = parentLogger.child({
    module: 'Users::getSciweaveMarketingConsentUsersCsv',
    userId: user.id,
  });

  logger.info(
    { fn: 'getSciweaveMarketingConsentUsersCsv' },
    `GET getSciweaveMarketingConsentUsersCsv called by ${user.email}`,
  );

  try {
    // Get validated query parameters
    const format = req.validatedData.query.format;
    const users = await getUsersWithSciweaveMarketingConsent();

    if (format === 'xlsx') {
      // Create Excel workbook
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(users.map((user) => ({ email: user.email })));

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sciweave Marketing Consent Users');

      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-disposition', 'attachment; filename=sciweave-marketing-consent-emails.xlsx');
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.status(200).send(excelBuffer);
    } else {
      // Default CSV format
      const csv = ['email', ...users.map((user) => user.email)].join('\n');

      res.setHeader('Content-disposition', 'attachment; filename=sciweave-marketing-consent-emails.csv');
      res.set('Content-Type', 'text/csv');
      res.status(200).send(csv);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to export Sciweave marketing consent users');
    res.status(500).json({ error: 'Failed to export Sciweave marketing consent users' });
  }
};
