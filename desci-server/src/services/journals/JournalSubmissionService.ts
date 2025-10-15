import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { EditorRole, JournalEventLogAction, JournalSubmission, Prisma, SubmissionStatus } from '@prisma/client';
import _ from 'lodash';
import { err, ok, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { ForbiddenError, NotFoundError } from '../../core/ApiError.js';
import { logger as parentLogger } from '../../logger.js';
import { getIndexedResearchObjects } from '../../theGraph.js';
import { hexToCid } from '../../utils.js';
import { getManifestByCid } from '../data/processing.js';
import { EmailTypes, sendEmail } from '../email/email.js';
import { SubmissionDetails, SubmissionExtended } from '../email/journalEmailTypes.js';
import { NotificationService } from '../Notifications/NotificationService.js';

import { JournalEventLogService } from './JournalEventLogService.js';
import { JournalManagementService } from './JournalManagementService.js';

const logger = parentLogger.child({
  module: 'Journals::JournalInviteService',
});

async function createSubmission(payload: { journalId: number; authorId: number; dpid: number; version: number }) {
  const existing = await prisma.journalSubmission.findFirst({
    where: {
      dpid: payload.dpid,
      journalId: payload.journalId,
    },
  });

  logger.trace({ existing }, 'Existing submission');

  if (existing) {
    // replace with error class from journals/core/errors.ts
    throw new ForbiddenError('Submission already exists');
  }

  const submission = await prisma.journalSubmission.create({
    data: { ...payload, status: SubmissionStatus.SUBMITTED },
  });

  return submission;
}

async function updateSubmissionStatus(submissionId: number, status: SubmissionStatus) {
  logger.trace({ submissionId, status }, 'Updating submission status');
  const submission = await prisma.journalSubmission.update({
    where: { id: submissionId },
    data: { status },
  });

  return _.pick(submission, ['id', 'status']);
}

async function getAuthorSubmissions(payload: { journalId: number; authorId: number; limit: number; offset: number }) {
  return await prisma.journalSubmission.findMany({
    where: {
      journalId: payload.journalId,
      authorId: payload.authorId,
    },
    select: {
      journal: {
        select: {
          id: true,
          name: true,
        },
      },
      dpid: true,
      version: true,
      status: true,
      id: true,
      authorId: true,
      assignedEditorId: true,
      assignedEditor: {
        select: {
          id: true,
          name: true,
          email: true,
          orcid: true,
        },
      },
      refereeAssignments: {
        select: {
          completedAssignment: true,
          dueDate: true,
          referee: {
            select: {
              name: true,
            },
          },
          completedAt: true,
        },
      },
    },
    skip: payload.offset,
    take: payload.limit,
  });
}

async function getJournalSubmissions(
  journalId: number,
  filter: Prisma.JournalSubmissionWhereInput,
  orderBy: Prisma.JournalSubmissionOrderByWithRelationInput,
  offset: number,
  limit: number,
) {
  return await prisma.journalSubmission.findMany({
    where: { journalId, ...filter },
    orderBy,
    skip: offset,
    take: limit,
    select: {
      id: true,
      dpid: true,
      doi: true,
      version: true,
      status: true,
      submittedAt: true,
      acceptedAt: true,
      rejectedAt: true,
      node: {
        select: {
          title: true,
        },
      },
      assignedEditor: {
        select: {
          name: true,
        },
      },
      author: {
        select: {
          name: true,
          orcid: true,
        },
      },
      refereeAssignments: {
        select: {
          completedAssignment: true,
          referee: {
            select: {
              name: true,
            },
          },
          completedAt: true,
        },
      },
    },
  });
}

async function getJournalSubmissionsCount(journalId: number, filter: Prisma.JournalSubmissionWhereInput) {
  return await prisma.journalSubmission.count({
    where: { journalId, ...filter },
  });
}

async function getFeaturedJournalPublications(
  filter: Prisma.JournalSubmissionWhereInput,
  orderBy?: Prisma.JournalSubmissionOrderByWithRelationInput,
  offset?: number,
  limit?: number,
) {
  return await prisma.journalSubmission.findMany({
    where: filter,
    ...(orderBy ? { orderBy } : {}),
    ...(offset ? { skip: offset } : {}),
    ...(limit ? { take: limit } : {}),
    select: {
      id: true,
    },
  });
}

async function getUrgentJournalSubmissions(
  journalId: number,
  filter: Prisma.JournalSubmissionWhereInput,
  limit: number,
) {
  return await prisma.journalSubmission.findMany({
    where: { journalId, ...filter },
    take: limit,
    select: {
      id: true,
      dpid: true,
      version: true,
      status: true,
      submittedAt: true,
      acceptedAt: true,
      rejectedAt: true,
      node: {
        select: {
          title: true,
        },
      },
      author: {
        select: {
          name: true,
          orcid: true,
        },
      },
      refereeAssignments: {
        select: {
          completedAssignment: true,
          dueDate: true,
          referee: {
            select: {
              name: true,
            },
          },
          completedAt: true,
        },
      },
      RefereeInvite: {
        select: {
          id: true,
          accepted: true,
          expiresAt: true,
        },
      },
      assignedEditor: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function getAssociateEditorSubmissions(
  journalId: number,
  assignedEditorId: number,
  filter: Prisma.JournalSubmissionWhereInput,
  orderBy: Prisma.JournalSubmissionOrderByWithRelationInput,
  offset: number,
  limit: number,
) {
  return await prisma.journalSubmission.findMany({
    where: {
      ...filter,
      journalId,
      assignedEditorId,
      // OR: [{ assignedEditorId }, { status: SubmissionStatus.ACCEPTED }],
    },
    orderBy,
    skip: offset,
    take: limit,
    select: {
      id: true,
      dpid: true,
      version: true,
      status: true,
      submittedAt: true,
      acceptedAt: true,
      rejectedAt: true,
      node: {
        select: {
          title: true,
        },
      },
      author: {
        select: {
          name: true,
          email: true,
          orcid: true,
        },
      },
      refereeAssignments: {
        select: {
          completedAssignment: true,
          dueDate: true,
          referee: {
            select: {
              name: true,
            },
          },
          completedAt: true,
        },
      },
      assignedEditor: {
        select: {
          name: true,
        },
      },
    },
  });
}

async function assignSubmissionToEditor(payload: {
  journalId: number;
  assignerId: number;
  submissionId: number;
  editorId: number;
}) {
  const chiefEditor = await prisma.journalEditor.findFirst({
    where: { userId: payload.assignerId, role: EditorRole.CHIEF_EDITOR, journalId: payload.journalId },
    include: {
      user: true,
    },
  });

  if (!chiefEditor) {
    throw new Error('Only Chief editor is allowed to assign submissions');
  }

  const submission = await prisma.journalSubmission.findUnique({
    where: { id: payload.submissionId },
    include: {
      journal: true,
    },
  });
  const submissionExtendedResult = await journalSubmissionService.getSubmissionExtendedData(payload.submissionId);
  if (submissionExtendedResult.isErr()) {
    throw new Error('Failed to get submission extended data');
  }
  const submissionExtended = submissionExtendedResult.value;

  if (!submission) {
    throw new Error('Submission not found');
  }

  if (submission.status !== SubmissionStatus.SUBMITTED) {
    throw new Error('Submission is not in the submitted state');
  }

  const editor = await prisma.journalEditor.findFirst({
    where: { userId: payload.editorId, journalId: submission.journalId },
    include: {
      user: true,
    },
  });

  const updatedSubmission = await prisma.journalSubmission.update({
    where: { id: payload.submissionId },
    data: {
      assignedEditorId: payload.editorId,
    },
    select: {
      id: true,
      assignedEditorId: true,
      status: true,
    },
  });

  try {
    await NotificationService.emitOnJournalSubmissionAssignedToEditor({
      journal: submission.journal,
      editor: editor,
      managerEditor: chiefEditor,
      submission: submission,
      submissionTitle: submissionExtended.title,
    });

    await sendEmail({
      type: EmailTypes.SUBMISSION_ASSIGNED_TO_EDITOR,
      payload: {
        email: editor.user.email,
        journal: submission.journal,
        assigner: {
          name: chiefEditor.user.name,
          userId: chiefEditor.user.id,
        },
        editor: {
          name: editor.user.name,
          userId: editor.user.id,
        },
        submission: submissionExtended,
      },
    });
  } catch (e) {
    logger.error(
      { fn: 'assignSubmissionToEditor', error: e, submissionId: payload.submissionId },
      'Notification push failed',
    );
  }

  return updatedSubmission;
}

async function acceptSubmission({ editorId, submissionId }: { editorId: number; submissionId: number }) {
  const submission = await prisma.journalSubmission.findUnique({
    where: { id: submissionId },
    include: {
      journal: true,
      author: true,
      assignedEditor: true,
    },
  });

  const submissionExtendedResult = await journalSubmissionService.getSubmissionExtendedData(submissionId);
  if (submissionExtendedResult.isErr()) {
    throw new Error('Failed to get submission extended data');
  }
  const submissionExtended = submissionExtendedResult.value;

  const editorJournalRole = await JournalManagementService.getUserJournalRole(submission.journalId, editorId);
  if (editorJournalRole.isErr()) {
    throw new Error('Failed to get editor journal role');
  }
  const isEditor = editorJournalRole.isOk();
  const editorRole = isEditor ? editorJournalRole.value : undefined;
  const isEditorAssigned = submission.assignedEditorId === editorId;
  const isChiefEditor = editorRole === EditorRole.CHIEF_EDITOR;
  logger.trace({ isEditor, isEditorAssigned, editorRole }, 'acceptSubmission::isEditor');
  if (!isEditorAssigned && !isChiefEditor) {
    throw new ForbiddenError('You are not authorized to accept this submission');
  }

  if (submission.status === SubmissionStatus.ACCEPTED) {
    throw new ForbiddenError('Submission is already accepted');
  }

  if (submission.status !== SubmissionStatus.UNDER_REVIEW) {
    throw new ForbiddenError('Submission is not under review');
  }

  const updatedSubmission = await prisma.journalSubmission.update({
    where: { id: submissionId },
    data: {
      status: SubmissionStatus.ACCEPTED,
      acceptedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      acceptedAt: true,
      dpid: true,
    },
  });

  try {
    await NotificationService.emitOnSubmissionAcceptance({
      journal: submission.journal,
      submission: submission,
      submissionTitle: submissionExtended.title,
      author: submission.author,
    });
    await sendEmail({
      type: EmailTypes.SUBMISSION_ACCEPTED,
      payload: {
        email: submission.author.email,
        journal: submission.journal,
        editor: {
          name: submission.assignedEditor.name,
          userId: submission.assignedEditor.id,
        },
        submission: submissionExtended,
      },
    });
  } catch (e) {
    logger.error({ fn: 'acceptSubmission', error: e, submissionId }, 'Notification push failed');
  }

  return updatedSubmission;
}
async function rejectSubmission({ editorId, submissionId }: { editorId: number; submissionId: number }) {
  const submission = await prisma.journalSubmission.findUnique({
    where: { id: submissionId },
    include: {
      journal: true,
      author: true,
    },
  });

  const editorJournalRole = await JournalManagementService.getUserJournalRole(submission.journalId, editorId);

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }

  const isEditor = editorJournalRole.isOk();
  const editorRole = isEditor ? editorJournalRole.value : undefined;
  const isEditorAssigned = submission.assignedEditorId === editorId;
  logger.trace({ isEditor, isEditorAssigned, editorRole }, 'rejectSubmission::isEditor');
  if (!isEditorAssigned && !(isEditor && editorRole === EditorRole.CHIEF_EDITOR)) {
    throw new ForbiddenError('You are not authorized to reject this submission');
  }

  if (submission.status === SubmissionStatus.ACCEPTED) {
    throw new ForbiddenError('Submission is already accepted');
  }

  if (submission.status === SubmissionStatus.REJECTED) {
    // throw new ForbiddenError('Submission is already rejected');
    return submission;
  }

  return await prisma.journalSubmission.update({
    where: { id: submissionId },
    data: {
      status: SubmissionStatus.REJECTED,
      rejectedAt: new Date(),
      acceptedAt: null, // reset acceptedAt to null
    },
    include: {
      journal: true,
      author: true,
    },
  });
}

async function requestRevision({
  editorId,
  submissionId,
  revisionType,
  comment,
}: {
  editorId: number;
  submissionId: number;
  revisionType: 'minor' | 'major';
  comment: string;
}) {
  const submission = await prisma.journalSubmission.findUnique({
    where: { id: submissionId },
  });

  if (!submission || submission.assignedEditorId !== editorId) {
    throw new NotFoundError('Submission not found');
  }

  if (submission.status === SubmissionStatus.ACCEPTED) {
    throw new ForbiddenError('Submission is already accepted');
  }

  if (submission.status === SubmissionStatus.REJECTED) {
    throw new ForbiddenError('Submission is already rejected');
  }

  const updatedSubmission = await prisma.journalSubmission.update({
    where: { id: submissionId },
    data: {
      status: SubmissionStatus.REVISION_REQUESTED,
    },
    select: {
      id: true,
      status: true,
    },
  });

  try {
    // Notification logic
    const submission = await prisma.journalSubmission.findUnique({
      where: { id: submissionId },
      include: {
        journal: true,
        author: true,
      },
    });

    const assignedEditor = await prisma.journalEditor.findUnique({
      where: { userId_journalId: { userId: submission.assignedEditorId, journalId: submission.journalId } },
      include: {
        user: true,
      },
    });

    const submissionExtendedResult = await journalSubmissionService.getSubmissionExtendedData(submissionId);
    if (submissionExtendedResult.isErr()) {
      throw new Error('Failed to get submission extended data');
    }
    const submissionExtended = submissionExtendedResult.value;

    const notifArgs = {
      journal: submission.journal,
      editor: assignedEditor,
      submission: submission,
      submissionTitle: submissionExtended.title,
      author: submission.author,
    };
    const emailPayload = {
      email: submission.author.email,
      journal: submission.journal,
      submission: submissionExtended,
      editor: {
        name: assignedEditor.user.name,
        userId: assignedEditor.userId,
      },
      comments: comment,
    };
    const isMajorRevision = revisionType === 'major';

    if (isMajorRevision) {
      await NotificationService.emitOnMajorRevisionRequest(notifArgs);
    } else {
      // Minor Revision
      await NotificationService.emitOnMinorRevisionRequest(notifArgs);
    }
    await sendEmail({
      type: isMajorRevision ? EmailTypes.MAJOR_REVISION_REQUEST : EmailTypes.MINOR_REVISION_REQUEST,
      payload: emailPayload,
    });
  } catch (e) {
    logger.error({ fn: 'acceptSubmission', error: e, submissionId }, 'Notification push failed');
  }

  return updatedSubmission;
}

async function getSubmissionById(submissionId: number) {
  const submission = await prisma.journalSubmission.findUnique({
    where: { id: submissionId },
    include: {
      journal: {
        select: {
          id: true,
          name: true,
        },
      },
      author: true,
      assignedEditor: {
        select: {
          id: true,
          name: true,
          orcid: true,
        },
      },
    },
  });

  if (!submission) {
    return err('Submission not found');
  }

  return ok(submission);
}

async function isSubmissionByAuthor(submissionId: number, authorId: number) {
  const submission = await prisma.journalSubmission.findFirst({
    where: { id: submissionId, authorId },
  });

  if (!submission) {
    return err(false);
  }

  return ok(true);
}

async function updateSubmissionDoi(submissionId: number, doi: string) {
  return await prisma.journalSubmission.update({
    where: { id: submissionId },
    data: { doi },
  });
}

async function updateSubmissionDoiMintedAt(doi: string) {
  const submission = await prisma.journalSubmission.findFirst({
    where: { doi },
  });

  if (!submission) {
    throw new NotFoundError('Submission not found');
  }

  JournalEventLogService.log({
    journalId: submission.journalId,
    action: JournalEventLogAction.SUBMISSION_DOI_MINTED,
    submissionId: submission.id,
    details: {
      doi,
    },
  });

  return await prisma.journalSubmission.update({
    where: { id: submission.id },
    data: { doiMintedAt: new Date() },
  });
}

const getSubmissionExtendedData = async (submissionId: number): Promise<Result<SubmissionExtended, Error>> => {
  const submission = await prisma.journalSubmission.findUnique({
    where: { id: submissionId },
    include: {
      journal: {
        select: {
          id: true,
          name: true,
        },
      },
      node: {
        select: {
          title: true,
          uuid: true,
        },
      },
      author: {
        select: {
          name: true,
          id: true,
          orcid: true,
        },
      },
      assignedEditor: {
        select: {
          id: true,
          name: true,
          orcid: true,
        },
      },
    },
  });
  if (process.env.NODE_ENV === 'test') {
    // The tests don't really care about this data, so just partial dummy data is used
    // In tests, we can't get resolve the research object, as it's not actually being published.
    return ok({
      ...submission,
      title: submission.node.title,
      authors: ['Test Author'],
      abstract: 'Test Abstract',
      submitterName: submission.author.name,
      submitterUserId: submission.author.id,
    });
  }
  const { researchObjects } = await getIndexedResearchObjects([submission.node.uuid]);
  if (!researchObjects || researchObjects.length === 0) {
    return err(new Error('No published version found for submission'));
  }
  const researchObject = researchObjects[0];

  const targetVersionIndex = researchObject.versions.length - submission.version;
  const targetVersion = researchObject.versions[targetVersionIndex];
  const targetVersionManifestCid = hexToCid(targetVersion.cid);
  const manifest = await getManifestByCid(targetVersionManifestCid);

  const authors = manifest.authors?.map((author) => author.name) ?? [];
  const abstract = manifest.description;
  const title = manifest.title;

  const submitterName = submission.author.name;
  const submitterUserId = submission.author.id;

  return ok({
    ...submission,
    title,
    authors,
    abstract,
    submitterName,
    submitterUserId,
  });
};

const getSubmissionDetails = async (submissionId: number): Promise<Result<SubmissionDetails, Error>> => {
  const submission = await prisma.journalSubmission.findUnique({
    where: { id: submissionId },
    include: {
      journal: {
        select: {
          id: true,
          name: true,
        },
      },
      node: {
        select: {
          title: true,
          uuid: true,
          DoiRecord: {
            select: {
              doi: true,
            },
          },
        },
      },
      author: {
        select: {
          name: true,
          id: true,
          orcid: true,
        },
      },
      assignedEditor: {
        select: {
          id: true,
          name: true,
          orcid: true,
        },
      },
    },
  });

  const doi = submission.node.DoiRecord[0]?.doi;
  if (process.env.NODE_ENV === 'test') {
    // The tests don't really care about this data, so just partial dummy data is used
    // In tests, we can't get resolve the research object, as it's not actually being published.
    const submissionDetails = {
      ...submission,
      researchObject: {
        ...submission.node,
        doi,
        manifest: {
          version: 'desci-nodes-0.1.0' as const,
          title: 'Test Title',
          authors: [{ name: 'Test Author', role: 'author' }],
          description: 'Test Abstract',
          components: [],
        },
        manifestCid: 'test-manifest-cid',
      },
    };
    return ok(submissionDetails);
  }
  const { researchObjects } = await getIndexedResearchObjects([submission.node.uuid]);
  if (!researchObjects || researchObjects.length === 0) {
    return err(new Error('No published version found for submission'));
  }
  const researchObject = researchObjects[0];

  const targetVersionIndex = researchObject.versions.length - submission.version;
  const targetVersion = researchObject.versions[targetVersionIndex];
  const targetVersionManifestCid = hexToCid(targetVersion.cid);
  const manifest = await getManifestByCid(targetVersionManifestCid);

  delete submission.node.DoiRecord;

  const submissionDetails = {
    ...submission,
    researchObject: { ...submission.node, doi, manifest, manifestCid: targetVersionManifestCid },
  };

  return ok(submissionDetails);
};

export type FeaturedSubmissionPartial = Pick<JournalSubmission, 'id' | 'dpid' | 'version' | 'doi' | 'submittedAt'>;
export type FeaturedSubmissionDetails = FeaturedSubmissionPartial & {
  researchObject: {
    uuid: string;
    manifest: ResearchObjectV1;
    publishedAt?: Date;
  };
  // included for convenience in the db query
  journal: {
    id: number;
    name: string;
  };
  author: {
    name: string;
    id: number;
    orcid: string;
  };
};

const getFeaturedPublicationDetails = async (
  submissionId: number,
): Promise<Result<FeaturedSubmissionDetails, Error>> => {
  const submission = await prisma.journalSubmission.findUnique({
    where: { id: submissionId },
    include: {
      journal: {
        select: {
          id: true,
          name: true,
        },
      },
      node: {
        select: {
          uuid: true,
        },
      },
      author: {
        select: {
          name: true,
          id: true,
          orcid: true,
        },
      },
    },
  });

  if (!submission) {
    return err(new NotFoundError('Submission not found'));
  }

  if (process.env.NODE_ENV === 'test') {
    // The tests don't really care about this data, so just partial dummy data is used
    // In tests, we can't get resolve the research object, as it's not actually being published.
    const submissionDetails = {
      ...submission,
      researchObject: {
        ...submission.node,
        manifest: {
          version: 'desci-nodes-0.1.0' as const,
          title: 'Test Title',
          authors: [{ name: 'Test Author', role: 'author' }],
          description: 'Test Abstract',
          components: [],
        },
        publishedAt: new Date(),
      },
    };
    return ok(submissionDetails);
  }
  const { researchObjects } = await getIndexedResearchObjects([submission.node.uuid]);
  if (!researchObjects || researchObjects.length === 0) {
    return err(new Error('No published version found for submission'));
  }
  const researchObject = researchObjects[0];

  const targetVersionIndex = researchObject.versions.length - submission.version;
  const targetVersion = researchObject.versions[targetVersionIndex];
  const targetVersionManifestCid = hexToCid(targetVersion.cid);
  const manifest = await getManifestByCid(targetVersionManifestCid);
  const publishedAt = targetVersion.time ? new Date(parseInt(targetVersion.time) * 1000) : undefined;
  logger.trace({ publishedAt, targetVersion }, 'Published at');

  const submissionDetails = {
    ...submission,
    researchObject: { ...submission.node, manifest, publishedAt },
  };

  return ok(submissionDetails);
};

/**
 * Check if the submission is desk rejected.
 ** Current criteria is if the submission was rejected before any referee invites are sent.
 */
const isSubmissionDeskRejection = async (submissionId: number): Promise<Result<boolean, Error>> => {
  const hasRefereeInvites = await prisma.refereeInvite.findFirst({
    where: { submissionId },
    select: {
      id: true,
    },
  });

  if (hasRefereeInvites) {
    return ok(false);
  }

  return ok(true);
};

export const journalSubmissionService = {
  createSubmission,
  getAuthorSubmissions,
  getJournalSubmissions,
  getJournalSubmissionsCount,
  assignSubmissionToEditor,
  getAssociateEditorSubmissions,
  acceptSubmission,
  rejectSubmission,
  requestRevision,
  getSubmissionById,
  updateSubmissionStatus,
  isSubmissionByAuthor,
  updateSubmissionDoi,
  updateSubmissionDoiMintedAt,
  getSubmissionExtendedData,
  isSubmissionDeskRejection,
  getSubmissionDetails,
  getUrgentJournalSubmissions,
  getFeaturedJournalPublications,
  getFeaturedPublicationDetails,
};
