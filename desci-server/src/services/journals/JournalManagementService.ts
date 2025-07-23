import {
  PrismaClient,
  EditorRole,
  JournalEventLogAction,
  Journal,
  Prisma,
  JournalEditor,
  SubmissionStatus,
  User,
} from '@prisma/client';
import _ from 'lodash';
import { ok, err, Result } from 'neverthrow';

import { logger } from '../../logger.js';

const prisma = new PrismaClient();

// Default journal settings
export const DEFAULT_JOURNAL_SETTINGS = {
  reviewDueHours: {
    min: 24, // 3 days
    max: 336, // 14 days
    default: 72, // 3 days
  },
  refereeInviteExpiryHours: {
    min: 24, // 1 day
    max: 168, // 7 days
    default: 168, // 7 days
  },
  refereeCount: {
    value: 2,
  },
} as const;

export type JournalSettings = {
  reviewDueHours: {
    min: number;
    max: number;
    default: number;
  };
  refereeInviteExpiryHours: {
    min: number;
    max: number;
    default: number;
  };
  refereeCount: {
    value: number;
  };
};

export function getJournalSettingsWithDefaults(settings: Prisma.JsonValue): JournalSettings {
  const parsedSettings = (settings as Record<string, any>) || {};

  return {
    reviewDueHours: {
      min: parsedSettings.reviewDueHours?.min ?? DEFAULT_JOURNAL_SETTINGS.reviewDueHours.min,
      max: parsedSettings.reviewDueHours?.max ?? DEFAULT_JOURNAL_SETTINGS.reviewDueHours.max,
      default: parsedSettings.reviewDueHours?.default ?? DEFAULT_JOURNAL_SETTINGS.reviewDueHours.default,
    },
    refereeInviteExpiryHours: {
      min: parsedSettings.refereeInviteExpiryHours?.min ?? DEFAULT_JOURNAL_SETTINGS.refereeInviteExpiryHours.min,
      max: parsedSettings.refereeInviteExpiryHours?.max ?? DEFAULT_JOURNAL_SETTINGS.refereeInviteExpiryHours.max,
      default:
        parsedSettings.refereeInviteExpiryHours?.default ?? DEFAULT_JOURNAL_SETTINGS.refereeInviteExpiryHours.default,
    },
    refereeCount: {
      value: parsedSettings.refereeCount?.value ?? DEFAULT_JOURNAL_SETTINGS.refereeCount.value,
    },
  };
}

/**
 * Helper function to get journal settings by ID with defaults.
 */
export async function getJournalSettingsByIdWithDefaults(journalId: number): Promise<Result<JournalSettings, Error>> {
  try {
    const journal = await prisma.journal.findUnique({
      where: { id: journalId },
      select: { settings: true },
    });

    if (!journal) {
      return err(new Error('Journal not found'));
    }

    return ok(getJournalSettingsWithDefaults(journal.settings));
  } catch (error) {
    logger.error({ error, journalId }, 'Failed to get journal settings by ID');
    return err(error instanceof Error ? error : new Error('Failed to get journal settings'));
  }
}

interface CreateJournalInput {
  name: string;
  description?: string;
  iconCid?: string;
  ownerId: number;
}
async function createJournal(data: CreateJournalInput): Promise<Result<Journal, Error>> {
  try {
    const journal = await prisma.journal.create({
      data: {
        name: data.name,
        description: data.description,
        iconCid: data.iconCid,
        settings: DEFAULT_JOURNAL_SETTINGS,
        editors: {
          create: {
            userId: data.ownerId,
            role: EditorRole.CHIEF_EDITOR,
            invitedAt: new Date(),
            acceptedAt: new Date(),
          },
        },
      },
    });
    await prisma.journalEventLog.create({
      data: {
        journalId: journal.id,
        action: JournalEventLogAction.JOURNAL_CREATED,
        userId: data.ownerId,
        details: {
          name: journal.name,
          description: journal.description,
          iconCid: journal.iconCid,
        },
      },
    });
    return ok(journal);
  } catch (error) {
    logger.error({ error, data }, 'Failed to create journal');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred during journal creation'));
  }
}

interface UpdateJournalInput {
  name?: string;
  description?: string;
  iconCid?: string;
}

async function updateJournal(
  journalId: number,
  userId: number,
  data: UpdateJournalInput,
): Promise<Result<Journal, Error>> {
  logger.trace({ journalId, data }, 'Updating journal');
  try {
    const journalBeforeUpdate = await prisma.journal.findUnique({
      where: { id: journalId },
    });

    if (!journalBeforeUpdate) {
      logger.warn({ journalId }, 'Journal not found for update');
      return err(new Error('Journal not found.'));
    }

    const changes: Record<string, { old: string | null; new: string }> = {};
    const fieldsToCompare: (keyof UpdateJournalInput)[] = ['name', 'description', 'iconCid'];

    for (const key of fieldsToCompare) {
      const newValue = data[key];
      const oldValue = journalBeforeUpdate[key];

      if (newValue !== undefined && newValue !== oldValue) {
        changes[key] = { old: oldValue as string | null, new: newValue };
      }
    }

    if (Object.keys(changes).length === 0) {
      logger.info({ journalId, userId, receivedData: data }, 'No changes to update.');
      return ok(journalBeforeUpdate);
    }

    const [updatedJournal] = await prisma.$transaction([
      prisma.journal.update({
        where: { id: journalId },
        data: {
          // Prisma handles undefineds, their fields won't be changed.
          name: data.name,
          description: data.description,
          iconCid: data.iconCid,
        },
      }),
      prisma.journalEventLog.create({
        data: {
          journalId: journalId,
          action: JournalEventLogAction.JOURNAL_UPDATED,
          userId,
          details: changes,
        },
      }),
    ]);

    logger.info({ journalId, userId, actualChanges: changes }, 'Journal updated successfully');
    return ok(updatedJournal);
  } catch (error) {
    logger.error({ error, journalId, userId, data }, 'Failed to update journal');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred during journal update'));
  }
}

export type JournalDetails = Prisma.JournalGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    iconCid: true;
    createdAt: true;
    editors: {
      include: {
        user: {
          select: {
            id: true;
            name: true;
            email: true;
            orcid: true;
          };
        };
      };
    };
  };
}> & {
  editors: Array<
    Prisma.JournalEditorGetPayload<{
      include: {
        user: {
          select: {
            id: true;
            name: true;
            email: true;
            orcid: true;
          };
        };
      };
    }> & { currentWorkload: number }
  >;
};

async function getJournalById(journalId: number): Promise<Result<JournalDetails, Error>> {
  try {
    const journal = await prisma.journal.findUnique({
      where: { id: journalId },
      select: {
        id: true,
        name: true,
        description: true,
        iconCid: true,
        createdAt: true,
        editors: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                orcid: true,
              },
            },
          },
        },
      },
    });

    if (!journal) {
      logger.warn({ journalId }, 'Journal not found by ID');
      return err(new Error('Journal not found.'));
    }

    // Calculate current workload for each editor
    const workloadCounts = await prisma.journalSubmission.groupBy({
      by: ['assignedEditorId'],
      where: {
        journalId: journal.id,
        assignedEditorId: { in: journal.editors.map((e) => e.userId) },
        status: {
          notIn: [SubmissionStatus.ACCEPTED, SubmissionStatus.REJECTED],
        },
      },
      _count: {
        id: true,
      },
    });

    const workloadMap = new Map(workloadCounts.map((w) => [w.assignedEditorId, w._count.id]));

    const editorsWithWorkload = journal.editors.map((editor) => ({
      ...editor,
      currentWorkload: workloadMap.get(editor.userId) || 0,
    }));

    const journalWithWorkload = {
      ...journal,
      editors: editorsWithWorkload,
    };

    return ok(journalWithWorkload);
  } catch (error) {
    logger.error({ error, journalId }, 'Failed to get journal by ID');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while fetching journal by ID'));
  }
}

export type JournalEditorialBoard = Array<
  Prisma.JournalEditorGetPayload<{
    select: {
      id: true;
      userId: true;
      role: true;
      invitedAt: true;
      acceptedAt: true;
      expertise: true;
      maxWorkload: true;
      user: {
        select: {
          id: true;
          name: true;
          email: true;
          orcid: true;
        };
      };
    };
  }> & { currentWorkload: number; expired?: boolean }
>;

async function getJournalEditorialBoardById(journalId: number): Promise<Result<JournalEditorialBoard, Error>> {
  try {
    const journal = await prisma.journal.findUnique({
      where: { id: journalId },
      select: {
        id: true,
      },
    });

    if (!journal) {
      logger.warn({ journalId }, 'Journal not found by ID');
      return err(new Error('Journal not found.'));
    }

    const editors = await prisma.journalEditor.findMany({
      where: { journalId },
      select: {
        id: true,
        userId: true,
        role: true,
        invitedAt: true,
        acceptedAt: true,
        maxWorkload: true,
        expertise: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            orcid: true,
          },
        },
      },
    });

    // Calculate current workload for each editor
    const workloadCounts = await prisma.journalSubmission.groupBy({
      by: ['assignedEditorId'],
      where: {
        journalId,
        assignedEditorId: { in: editors.map((e) => e.userId) },
        status: {
          notIn: [SubmissionStatus.ACCEPTED, SubmissionStatus.REJECTED],
        },
      },
      _count: {
        id: true,
      },
    });

    const workloadMap = new Map(workloadCounts.map((w) => [w.assignedEditorId, w._count.id]));

    const editorsWithWorkload = editors.map((editor) => ({
      ...editor,
      currentWorkload: workloadMap.get(editor.userId) || 0,
    }));

    const acceptedEditorEmails = editors.map((e) => e.user.email).filter(Boolean);
    logger.info({ acceptedEditorEmails }, 'Accepted editor emails');
    const pendingEditorInvites = await prisma.editorInvite.findMany({
      where: {
        journalId,
        accepted: null,
        email: {
          notIn: acceptedEditorEmails,
        },
      },
      orderBy: {
        expiresAt: 'desc',
      },
    });
    logger.info({ pendingEditorInvites }, 'Pending editor invites');
    const uniqueEditorInvites = _.uniqBy(pendingEditorInvites, 'email');
    logger.info({ uniqueEditorInvites }, 'Unique editor invites');
    const pendingEditors = uniqueEditorInvites.map((e) => ({
      id: e.id,
      invitedAt: e.createdAt,
      acceptedAt: null,
      user: { id: 0, email: e.email, name: e.email, orcid: '' },
      currentWorkload: 0,
      maxWorkload: 0,
      role: e.role,
      expertise: [],
      userId: 0,
      expired: e.expiresAt < new Date(),
    }));
    logger.info({ pendingEditors }, 'Pending editors');

    const journalWithWorkload = [...editorsWithWorkload, ...pendingEditors];
    logger.info({ journalWithWorkload }, 'Journal editorial board');
    return ok(journalWithWorkload);
  } catch (error) {
    logger.error({ error, journalId }, 'Failed to get journal by ID');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while fetching journal by ID'));
  }
}

export type ListedJournal = Prisma.JournalGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    iconCid: true;
    createdAt: true;
  };
}>;

/**
 * @param userId - The user ID to filter journals by. If not provided, all journals will be returned.
 */
async function listJournals(userId?: number): Promise<Result<ListedJournal[], Error>> {
  try {
    const whereClause: Prisma.JournalWhereInput = {};

    if (userId) {
      whereClause.editors = { some: { userId } };
    }

    const journals = await prisma.journal.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        iconCid: true,
        createdAt: true,
      },
      where: whereClause,
    });
    return ok(journals);
  } catch (error) {
    logger.error({ error }, 'Failed to list journals in service');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while listing journals'));
  }
}

async function removeEditorFromJournal(
  journalId: number,
  managerId: number,
  editorUserId: number,
): Promise<Result<void, Error>> {
  try {
    const editorBeingRemoved = await prisma.journalEditor.findUnique({
      where: { userId_journalId: { userId: editorUserId, journalId } },
    });

    logger.info(
      { journalId, managerId, editorUserId, editorBeingRemovedId: editorBeingRemoved?.id },
      'Attempting to remove editor from journal',
    );

    if (!editorBeingRemoved) {
      logger.warn({ journalId, managerId, editorUserId }, 'Editor not found for removal');
      return err(new Error('Editor not found.'));
    }

    if (editorBeingRemoved.userId === managerId) {
      logger.info({ journalId, managerId, editorUserId }, 'CHIEF_EDITOR attempted to remove themselves');
      return err(new Error('Cannot remove yourself as a CHIEF_EDITOR.'));
    }

    await prisma.$transaction([
      prisma.journalEventLog.create({
        data: {
          journalId,
          action: JournalEventLogAction.EDITOR_REMOVED,
          userId: managerId,
          details: {
            managerId,
            editorUserId,
            editorEntry: {
              ...editorBeingRemoved,
              invitedAt: editorBeingRemoved.invitedAt.toISOString(),
              acceptedAt: editorBeingRemoved.acceptedAt ? editorBeingRemoved.acceptedAt.toISOString() : null,
            },
          },
        },
      }),
      prisma.journalEditor.delete({
        where: { id: editorBeingRemoved.id },
      }),
    ]);

    logger.info(
      { journalId, managerId, editorUserId, removedEditorId: editorBeingRemoved.id },
      'Editor removed successfully from journal',
    );
    return ok(undefined);
  } catch (error) {
    logger.error({ error, journalId, managerId, editorUserId }, 'Failed to remove editor from journal');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while removing editor'));
  }
}

async function updateEditorRole(
  journalId: number,
  managerId: number,
  editorUserId: number,
  role: EditorRole,
): Promise<Result<JournalEditor, Error>> {
  logger.trace({ journalId, managerId, editorUserId, role }, 'Attempting to update editor role');
  try {
    const editorBeingUpdated = await prisma.journalEditor.findUnique({
      where: { userId_journalId: { userId: editorUserId, journalId } },
    });

    if (!editorBeingUpdated) {
      logger.warn({ journalId, managerId, editorUserId, role }, 'Editor not found for role update');
      return err(new Error('Editor not found.'));
    }

    if (managerId === editorBeingUpdated.userId) {
      logger.warn({ journalId, managerId, editorUserId, role }, 'CHIEF_EDITOR attempted to change their own role');
      return err(new Error('Cannot demote yourself.'));
    }

    if (editorBeingUpdated.role === role) {
      logger.info(
        { journalId, managerId, editorUserId, role },
        'Editor role is already set to the target role. No update needed.',
      );
      return ok(undefined);
    }

    const [updatedEditor] = await prisma.$transaction([
      prisma.journalEditor.update({
        where: { id: editorBeingUpdated.id },
        data: { role },
      }),
      prisma.journalEventLog.create({
        data: {
          journalId,
          action: JournalEventLogAction.EDITOR_ROLE_CHANGED,
          userId: managerId,
          details: {
            managerId,
            editorUserId,
            previousRole: editorBeingUpdated.role,
            newRole: role,
          },
        },
      }),
    ]);

    logger.info(
      { journalId, managerId, editorUserId, newRole: role, previousRole: editorBeingUpdated.role },
      'Editor role updated',
    );
    return ok(updatedEditor);
  } catch (error) {
    logger.error({ error, journalId, managerId, editorUserId, role }, 'Failed to update editor role');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while updating editor role'));
  }
}

/**
 * Update editor settings, configurable by the editor themselves.
 * @example expertise, workload.
 */
async function updateEditor(
  journalId: number,
  editorUserId: number,
  data: Prisma.JournalEditorUpdateInput,
): Promise<Result<JournalEditor, Error>> {
  logger.trace({ journalId, editorUserId }, 'Attempting to update editor role');
  try {
    const editorBeingUpdated = await prisma.journalEditor.findUnique({
      where: { userId_journalId: { userId: editorUserId, journalId } },
    });

    if (!editorBeingUpdated) {
      logger.warn({ journalId, editorUserId }, 'Editor not found for update');
      return err(new Error('Editor not found.'));
    }

    const filteredFields = ['expertise', 'maxWorkload'];
    const filteredInputs = _.pick(data, filteredFields);
    const previousData = _.pick(editorBeingUpdated, filteredFields);

    const [updatedEditor] = await prisma.$transaction([
      prisma.journalEditor.update({
        where: { id: editorBeingUpdated.id },
        data: filteredInputs,
      }),
      prisma.journalEventLog.create({
        data: {
          journalId,
          action: JournalEventLogAction.EDITOR_UPDATED,
          userId: editorUserId,
          details: {
            editorUserId,
            previousData: previousData as Prisma.InputJsonValue,
            newData: filteredInputs as Prisma.InputJsonValue,
          },
        },
      }),
    ]);

    logger.info(
      {
        journalId,
        editorUserId,
        newData: filteredInputs,
        previousData,
      },
      'Editor updated',
    );
    return ok(updatedEditor);
  } catch (error) {
    logger.error({ error, journalId, editorUserId }, 'Failed to update editor');
    return err(error instanceof Error ? error : new Error('An unexpected error occurred while updating editor'));
  }
}

async function getUserJournalRole(journalId: number, userId: number): Promise<Result<EditorRole, Error>> {
  const editor = await prisma.journalEditor.findUnique({
    where: { userId_journalId: { userId, journalId } },
  });

  if (!editor) {
    return err(new Error('Editor not found.'));
  }

  return ok(editor.role);
}

async function getJournalProfile(userId: number): Promise<
  Result<
    {
      role: EditorRole;
      journalId: number;
      journal: {
        id: number;
        name: string;
        description: string;
        iconCid: string;
      };
    }[],
    Error
  >
> {
  const result = await prisma.journalEditor.findMany({
    where: {
      userId: userId,
    },
    select: {
      journalId: true,
      userId: true,
      journal: {
        select: {
          id: true,
          name: true,
          description: true,
          iconCid: true,
        },
      },
      role: true,
    },
  });
  return ok(result);
}

type IJournalEditor = JournalEditor & {
  user: Pick<User, 'id' | 'name' | 'orcid'>;
  currentWorkload: number;
  available: boolean;
};

export async function getJournalEditors(
  journalId: number,
  filter: Prisma.JournalEditorWhereInput,
  orderBy: Prisma.JournalEditorOrderByWithRelationInput,
  // limit: number,
  // offset: number,
): Promise<Result<IJournalEditor[], Error>> {
  const editors = await prisma.journalEditor.findMany({
    where: { journalId, ...filter },
    orderBy,
    // skip: offset,
    // take: limit,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          orcid: true,
        },
      },
    },
  });

  const editorsWithCounts = await Promise.all(
    editors.map(async (editor) => {
      const currentWorkload = await prisma.journalSubmission.count({
        where: {
          journalId,
          assignedEditorId: editor.userId,
          status: {
            notIn: [SubmissionStatus.ACCEPTED, SubmissionStatus.REJECTED],
          },
        },
      });
      return {
        ...editor,
        currentWorkload,
        available: currentWorkload < editor.maxWorkload,
      };
    }),
  );

  return ok(editorsWithCounts);
}

interface JournalSettingsInput {
  description?: string;
  settings?: {
    reviewDueHours?: {
      min?: number;
      max?: number;
      default?: number;
    };
    refereeInviteExpiryHours?: {
      min?: number;
      max?: number;
      default?: number;
    };
    refereeCount?: {
      value?: number;
    };
  };
}

async function getJournalSettings(
  journalId: number,
): Promise<Result<{ description: string | null; settings: JournalSettings }, Error>> {
  try {
    const journal = await prisma.journal.findUnique({
      where: { id: journalId },
      select: {
        description: true,
        settings: true,
      },
    });

    if (!journal) {
      logger.warn({ journalId }, 'Journal not found for settings');
      return err(new Error('Journal not found.'));
    }

    const settings = getJournalSettingsWithDefaults(journal.settings);

    return ok({
      description: journal.description,
      settings,
    });
  } catch (error) {
    logger.error({ error, journalId }, 'Failed to get journal settings');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred while fetching journal settings'),
    );
  }
}

async function updateJournalSettings(
  journalId: number,
  userId: number,
  data: JournalSettingsInput,
): Promise<Result<{ description: string | null; settings: JournalSettings }, Error>> {
  logger.trace({ journalId, userId, data }, 'Updating journal settings');

  try {
    const journalBeforeUpdate = await prisma.journal.findUnique({
      where: { id: journalId },
      select: {
        description: true,
        settings: true,
      },
    });

    if (!journalBeforeUpdate) {
      logger.warn({ journalId }, 'Journal not found for settings update');
      return err(new Error('Journal not found.'));
    }

    const changes: Record<string, { old: any; new: any }> = {};
    const currentSettings = getJournalSettingsWithDefaults(journalBeforeUpdate.settings);

    // Check for description change
    if (data.description !== undefined && data.description !== journalBeforeUpdate.description) {
      changes.description = { old: journalBeforeUpdate.description, new: data.description };
    }

    // Check for settings changes
    const newSettings = { ...currentSettings };
    if (data.settings) {
      if (data.settings.reviewDueHours) {
        const oldReviewDueHours = currentSettings.reviewDueHours;
        const newReviewDueHours = { ...oldReviewDueHours, ...data.settings.reviewDueHours };
        if (JSON.stringify(oldReviewDueHours) !== JSON.stringify(newReviewDueHours)) {
          newSettings.reviewDueHours = newReviewDueHours;
          changes.reviewDueHours = { old: oldReviewDueHours, new: newReviewDueHours };
        }
      }

      if (data.settings.refereeInviteExpiryHours) {
        const oldRefereeInviteExpiryHours = currentSettings.refereeInviteExpiryHours;
        const newRefereeInviteExpiryHours = {
          ...oldRefereeInviteExpiryHours,
          ...data.settings.refereeInviteExpiryHours,
        };
        if (JSON.stringify(oldRefereeInviteExpiryHours) !== JSON.stringify(newRefereeInviteExpiryHours)) {
          newSettings.refereeInviteExpiryHours = newRefereeInviteExpiryHours;
          changes.refereeInviteExpiryHours = { old: oldRefereeInviteExpiryHours, new: newRefereeInviteExpiryHours };
        }
      }

      if (data.settings.refereeCount) {
        const oldRefereeCount = currentSettings.refereeCount;
        const newRefereeCount = { ...oldRefereeCount, ...data.settings.refereeCount };
        if (JSON.stringify(oldRefereeCount) !== JSON.stringify(newRefereeCount)) {
          newSettings.refereeCount = newRefereeCount;
          changes.refereeCount = { old: oldRefereeCount, new: newRefereeCount };
        }
      }
    }

    if (Object.keys(changes).length === 0) {
      logger.info({ journalId, userId, receivedData: data }, 'No changes to update in journal settings.');
      return ok({
        description: journalBeforeUpdate.description,
        settings: currentSettings,
      });
    }

    const [updatedJournal] = await prisma.$transaction([
      prisma.journal.update({
        where: { id: journalId },
        data: {
          description: data.description,
          settings: newSettings,
        },
        select: {
          description: true,
          settings: true,
        },
      }),
      prisma.journalEventLog.create({
        data: {
          journalId: journalId,
          action: JournalEventLogAction.JOURNAL_UPDATED,
          userId,
          details: changes,
        },
      }),
    ]);

    logger.info({ journalId, userId, actualChanges: changes }, 'Journal settings updated successfully');
    return ok({
      description: updatedJournal.description,
      settings: getJournalSettingsWithDefaults(updatedJournal.settings),
    });
  } catch (error) {
    logger.error({ error, journalId, userId, data }, 'Failed to update journal settings');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during journal settings update'),
    );
  }
}

export const JournalManagementService = {
  createJournal,
  updateJournal,
  getJournalById,
  listJournals,
  removeEditorFromJournal,
  updateEditorRole,
  updateEditor,
  getUserJournalRole,
  getJournalProfile,
  getJournalEditors,
  getJournalSettings,
  updateJournalSettings,
  getJournalEditorialBoardById,
};
