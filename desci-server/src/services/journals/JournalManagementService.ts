import {
  PrismaClient,
  EditorRole,
  JournalEventLogAction,
  Journal,
  JournalApplicationStatus,
  JournalApplication,
  Prisma,
  JournalEditor,
  SubmissionStatus,
  User,
} from '@prisma/client';
import _ from 'lodash';
import { ok, err, Result } from 'neverthrow';
import slugifyModule from 'slugify';

import { logger } from '../../logger.js';
import { FormStructure } from '../../schemas/journalsForm.schema.js';
import { EmailTypes, sendEmail } from '../email/email.js';

import { JournalFormService } from './JournalFormService.js';

const prisma = new PrismaClient();

const slugify = slugifyModule.default;

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
  defaultDataLicense: null as string | null,
  defaultCodeLicense: null as string | null,
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
  defaultDataLicense: string | null;
  defaultCodeLicense: string | null;
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
    defaultDataLicense:
      parsedSettings.defaultDataLicense !== undefined
        ? parsedSettings.defaultDataLicense
        : DEFAULT_JOURNAL_SETTINGS.defaultDataLicense,
    defaultCodeLicense:
      parsedSettings.defaultCodeLicense !== undefined
        ? parsedSettings.defaultCodeLicense
        : DEFAULT_JOURNAL_SETTINGS.defaultCodeLicense,
  };
}

/**
 * Creates the default peer review form template structure for new journals.
 * Based on standard academic review criteria covering Introduction, Methods, Results, and Discussion.
 */
function createDefaultFormTemplate(): FormStructure {
  const radioOptions = [
    { value: 'yes', label: 'Yes' },
    { value: 'partially', label: 'Partially' },
    { value: 'no', label: 'No' },
  ];

  return {
    formStructureVersion: 'journal-forms-v1.0.0',
    sections: [
      {
        id: 'introduction',
        title: 'Introduction',
        description: "Evaluation of the paper's introduction and literature review",
        fields: [
          {
            id: 'background_literature',
            name: 'background_literature',
            label: 'Is the background and literature section up to date and appropriate for the topic?',
            fieldType: 'RADIO',
            required: true,
            options: radioOptions,
          },
          {
            id: 'objectives_stated',
            name: 'objectives_stated',
            label: 'Are the primary (and secondary) objectives clearly stated at the end of the introduction?',
            fieldType: 'RADIO',
            required: true,
            options: radioOptions,
          },
        ],
      },
      {
        id: 'methods',
        title: 'Methods',
        description: 'Assessment of methodology and statistical approaches',
        fields: [
          {
            id: 'methods_detail',
            name: 'methods_detail',
            label:
              'Are the study methods (including theory/applicability/modelling) reported in sufficient detail to allow for their replicability or reproducibility?',
            fieldType: 'RADIO',
            required: true,
            options: radioOptions,
          },
          {
            id: 'statistical_analysis',
            name: 'statistical_analysis',
            label:
              'Are statistical analyses, controls, sampling mechanism, and statistical reporting (e.g., P-values, CIs, effect sizes) appropriate and well described?',
            fieldType: 'RADIO',
            required: true,
            options: radioOptions,
          },
        ],
      },
      {
        id: 'results',
        title: 'Results',
        description: 'Evaluation of results presentation and analysis',
        fields: [
          {
            id: 'results_presentation',
            name: 'results_presentation',
            label:
              'Is the results presentation, including the number of tables and figures, appropriate to best present the study findings?',
            fieldType: 'RADIO',
            required: true,
            options: radioOptions,
          },
          {
            id: 'additional_analyses',
            name: 'additional_analyses',
            label:
              'Are additional sub-analyses or statistical measures needed (e.g., reporting of CIs, effect sizes, sensitivity analyses)?',
            fieldType: 'RADIO',
            required: true,
            options: radioOptions,
          },
        ],
      },
      {
        id: 'discussion',
        title: 'Discussion',
        description: 'Assessment of interpretation and study limitations',
        fields: [
          {
            id: 'interpretation_supported',
            name: 'interpretation_supported',
            label: 'Is the interpretation of results and study conclusions supported by the data and the study design?',
            fieldType: 'RADIO',
            required: true,
            options: radioOptions,
          },
          {
            id: 'limitations_emphasized',
            name: 'limitations_emphasized',
            label: 'Have the authors clearly emphasized the limitations of their study/theory/methods/argument?',
            fieldType: 'RADIO',
            required: true,
            options: radioOptions,
          },
        ],
      },
    ],
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
  slug?: string;
  description?: string;
  iconCid?: string;
  imageUrl?: string;
  ownerId: number;
}
async function createJournal(data: CreateJournalInput): Promise<Result<Journal, Error>> {
  try {
    const journal = await prisma.journal.create({
      data: {
        name: data.name,
        slug: data.slug ?? slugify(data.name, { lower: true, strict: true }),
        description: data.description,
        iconCid: data.iconCid,
        imageUrl: data.imageUrl,
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
          imageUrl: journal.imageUrl,
        },
      },
    });

    // Create default peer review form template
    const defaultFormResult = await JournalFormService.createFormTemplate(data.ownerId, {
      journalId: journal.id,
      name: 'Standard Peer Review Form',
      description: 'Default academic peer review form covering Introduction, Methods, Results, and Discussion sections',
      structure: createDefaultFormTemplate(),
    });

    if (defaultFormResult.isErr()) {
      logger.warn(
        { error: defaultFormResult.error, journalId: journal.id },
        'Failed to create default form template, but journal was created successfully',
      );
    } else {
      logger.info(
        { journalId: journal.id, templateId: defaultFormResult.value.id },
        'Default form template created successfully',
      );
    }

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
  imageUrl?: string;
  slug?: string;
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
    const fieldsToCompare: (keyof UpdateJournalInput)[] = ['name', 'description', 'iconCid', 'imageUrl'];

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
          imageUrl: data.imageUrl,
          slug: data.slug,
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
    slug: true;
    description: true;
    iconCid: true;
    imageUrl: true;
    createdAt: true;
    aboutArticle: true;
    editorialBoardArticle: true;
    authorInstruction: true;
    refereeInstruction: true;
    settings: true;
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
  settings: JournalSettings;
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
        slug: true,
        description: true,
        iconCid: true,
        imageUrl: true,
        createdAt: true,
        aboutArticle: true,
        editorialBoardArticle: true,
        authorInstruction: true,
        refereeInstruction: true,
        settings: true,
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
      settings: getJournalSettingsWithDefaults(journal.settings),
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
  }> & { currentWorkload: number; expired?: boolean; inviteId?: number }
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
    const uniqueEditorInvites = _.uniqBy(pendingEditorInvites, 'email');
    const pendingEditors = uniqueEditorInvites.map((e) => ({
      id: e.id,
      invitedAt: e.createdAt,
      acceptedAt: null,
      user: { id: 0, email: e.email, name: e.name || e.email, orcid: '' },
      currentWorkload: 0,
      maxWorkload: 0,
      role: e.role,
      expertise: [],
      userId: 0,
      expired: e.expiresAt < new Date(),
      inviteId: e.id,
    }));

    const journalWithWorkload = [...editorsWithWorkload, ...pendingEditors];

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
    slug: true;
    iconCid: true;
    imageUrl: true;
    createdAt: true;
    aboutArticle: true;
    editorialBoardArticle: true;
    authorInstruction: true;
    refereeInstruction: true;
    settings: true;
    submissions: {
      select: { id: true };
      where: {
        status: 'ACCEPTED';
      };
    };
  };
}> & {
  settings: JournalSettings;
};

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
        slug: true,
        iconCid: true,
        imageUrl: true,
        createdAt: true,
        aboutArticle: true,
        editorialBoardArticle: true,
        authorInstruction: true,
        refereeInstruction: true,
        settings: true,
        submissions: {
          select: { id: true },
          where: {
            status: SubmissionStatus.ACCEPTED,
          },
        },
      },
      where: whereClause,
    });

    const journalsWithProcessedSettings = journals.map((journal) => ({
      ...journal,
      settings: getJournalSettingsWithDefaults(journal.settings),
    }));

    return ok(journalsWithProcessedSettings);
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
        imageUrl: string | null;
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
          imageUrl: true,
        },
      },
      role: true,
    },
  });
  return ok(result);
}

type IJournalEditor = JournalEditor & {
  user: Pick<User, 'name' | 'orcid'>;
  currentWorkload?: number;
  available?: boolean;
};

export async function getJournalEditors(
  journalId: number,
  filter: Prisma.JournalEditorWhereInput,
  orderBy: Prisma.JournalEditorOrderByWithRelationInput,
  withAvailable: boolean = true,
): Promise<Result<IJournalEditor[], Error>> {
  const editors = await prisma.journalEditor.findMany({
    where: { journalId, ...filter },
    orderBy,
    include: {
      user: {
        select: {
          name: true,
          orcid: true,
          userOrganizations: {
            select: {
              organizationId: true,
              organization: {
                select: {
                  name: true,
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const editorsWithCounts = withAvailable
    ? await Promise.all(
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
      )
    : editors;

  return ok(
    editorsWithCounts.map((editor) => ({
      ...editor,
      user: {
        ...editor.user,
        organizations: editor.user.userOrganizations.map((org) => org.organization),
      },
    })),
  );
}

interface JournalSettingsInput {
  description?: string;
  aboutArticle?: string;
  editorialBoardArticle?: string;
  authorInstruction?: string;
  refereeInstruction?: string;
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
    defaultDataLicense?: string | null;
    defaultCodeLicense?: string | null;
  };
}

async function getJournalSettings(journalId: number): Promise<
  Result<
    {
      description: string | null;
      aboutArticle: string | null;
      editorialBoardArticle: string | null;
      authorInstruction: string | null;
      refereeInstruction: string | null;
      settings: JournalSettings;
    },
    Error
  >
> {
  try {
    const journal = await prisma.journal.findUnique({
      where: { id: journalId },
      select: {
        description: true,
        aboutArticle: true,
        editorialBoardArticle: true,
        authorInstruction: true,
        refereeInstruction: true,
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
      aboutArticle: journal.aboutArticle,
      editorialBoardArticle: journal.editorialBoardArticle,
      authorInstruction: journal.authorInstruction,
      refereeInstruction: journal.refereeInstruction,
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
): Promise<
  Result<
    {
      description: string | null;
      aboutArticle: string | null;
      editorialBoardArticle: string | null;
      authorInstruction: string | null;
      refereeInstruction: string | null;
      settings: JournalSettings;
    },
    Error
  >
> {
  logger.trace({ journalId, userId, data }, 'Updating journal settings');

  try {
    const journalBeforeUpdate = await prisma.journal.findUnique({
      where: { id: journalId },
      select: {
        description: true,
        settings: true,
        aboutArticle: true,
        editorialBoardArticle: true,
        authorInstruction: true,
        refereeInstruction: true,
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

    if (data.aboutArticle !== undefined && data.aboutArticle !== journalBeforeUpdate.aboutArticle) {
      changes.aboutArticle = { old: journalBeforeUpdate.aboutArticle, new: data.aboutArticle };
    }

    if (
      data.editorialBoardArticle !== undefined &&
      data.editorialBoardArticle !== journalBeforeUpdate.editorialBoardArticle
    ) {
      changes.editorialBoardArticle = {
        old: journalBeforeUpdate.editorialBoardArticle,
        new: data.editorialBoardArticle,
      };
    }

    if (data.authorInstruction !== undefined && data.authorInstruction !== journalBeforeUpdate.authorInstruction) {
      changes.authorInstruction = { old: journalBeforeUpdate.authorInstruction, new: data.authorInstruction };
    }

    if (data.refereeInstruction !== undefined && data.refereeInstruction !== journalBeforeUpdate.refereeInstruction) {
      changes.refereeInstruction = { old: journalBeforeUpdate.refereeInstruction, new: data.refereeInstruction };
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

      if (data.settings.defaultDataLicense !== undefined) {
        const oldDefaultDataLicense = currentSettings.defaultDataLicense;
        const newDefaultDataLicense = data.settings.defaultDataLicense;
        if (oldDefaultDataLicense !== newDefaultDataLicense) {
          newSettings.defaultDataLicense = newDefaultDataLicense;
          changes.defaultDataLicense = { old: oldDefaultDataLicense, new: newDefaultDataLicense };
        }
      }

      if (data.settings.defaultCodeLicense !== undefined) {
        const oldDefaultCodeLicense = currentSettings.defaultCodeLicense;
        const newDefaultCodeLicense = data.settings.defaultCodeLicense;
        if (oldDefaultCodeLicense !== newDefaultCodeLicense) {
          newSettings.defaultCodeLicense = newDefaultCodeLicense;
          changes.defaultCodeLicense = { old: oldDefaultCodeLicense, new: newDefaultCodeLicense };
        }
      }
    }

    if (Object.keys(changes).length === 0) {
      logger.info({ journalId, userId, receivedData: data }, 'No changes to update in journal settings.');
      return ok({
        description: journalBeforeUpdate.description,
        aboutArticle: journalBeforeUpdate.aboutArticle,
        editorialBoardArticle: journalBeforeUpdate.editorialBoardArticle,
        authorInstruction: journalBeforeUpdate.authorInstruction,
        refereeInstruction: journalBeforeUpdate.refereeInstruction,
        settings: currentSettings,
      });
    }

    const [updatedJournal] = await prisma.$transaction([
      prisma.journal.update({
        where: { id: journalId },
        data: {
          description: data.description,
          aboutArticle: data.aboutArticle,
          editorialBoardArticle: data.editorialBoardArticle,
          authorInstruction: data.authorInstruction,
          refereeInstruction: data.refereeInstruction,
          settings: newSettings,
        },
        select: {
          description: true,
          aboutArticle: true,
          editorialBoardArticle: true,
          authorInstruction: true,
          refereeInstruction: true,
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
      aboutArticle: updatedJournal.aboutArticle,
      editorialBoardArticle: updatedJournal.editorialBoardArticle,
      authorInstruction: updatedJournal.authorInstruction,
      refereeInstruction: updatedJournal.refereeInstruction,
      settings: getJournalSettingsWithDefaults(updatedJournal.settings),
    });
  } catch (error) {
    logger.error({ error, journalId, userId, data }, 'Failed to update journal settings');
    return err(
      error instanceof Error ? error : new Error('An unexpected error occurred during journal settings update'),
    );
  }
}

// --- Journal Application (journal creation approval flow) ---

interface ApplyForJournalInput {
  name: string;
  description: string;
  iconCid?: string;
  editorialBoard: { name: string; email: string; role: string }[];
  instructionsForAuthors: string;
  instructionsForReviewers: string;
  applicantId: number;
}

async function applyForJournal(data: ApplyForJournalInput): Promise<Result<JournalApplication, Error>> {
  try {
    const applicant = await prisma.user.findUnique({
      where: { id: data.applicantId },
      select: { name: true, email: true },
    });

    const application = await prisma.journalApplication.create({
      data: {
        name: data.name,
        description: data.description,
        editorialBoard: data.editorialBoard,
        instructionsForAuthors: data.instructionsForAuthors,
        instructionsForReviewers: data.instructionsForReviewers,
        applicantId: data.applicantId,
      },
    });

    // Send notification email to admin
    const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'no-reply@desci.com';
    sendEmail({
      type: EmailTypes.JOURNAL_APPLICATION_SUBMITTED,
      payload: {
        to: ADMIN_NOTIFICATION_EMAIL,
        applicantName: applicant?.name || 'Unknown',
        applicantEmail: applicant?.email || 'Unknown',
        journalName: data.name,
        journalDescription: data.description,
      },
    }).catch((err) => {
      logger.error({ err, applicationId: application.id }, 'Failed to send journal application notification email');
    });

    logger.info({ applicationId: application.id, applicantId: data.applicantId }, 'Journal application created');
    return ok(application);
  } catch (error) {
    logger.error({ error, data }, 'Failed to create journal application');
    return err(error instanceof Error ? error : new Error('Failed to create journal application'));
  }
}

type JournalApplicationWithApplicant = JournalApplication & {
  applicant: Pick<User, 'id' | 'name' | 'email'>;
};

async function listJournalApplications(
  status?: JournalApplicationStatus,
): Promise<Result<JournalApplicationWithApplicant[], Error>> {
  try {
    const whereClause: Prisma.JournalApplicationWhereInput = {};
    if (status) {
      whereClause.status = status;
    }

    const applications = await prisma.journalApplication.findMany({
      where: whereClause,
      include: {
        applicant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return ok(applications);
  } catch (error) {
    logger.error({ error, status }, 'Failed to list journal applications');
    return err(error instanceof Error ? error : new Error('Failed to list journal applications'));
  }
}

async function approveJournalApplication(applicationId: number, adminUserId: number): Promise<Result<Journal, Error>> {
  try {
    const application = await prisma.journalApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      return err(new Error('Journal application not found.'));
    }

    if (application.status !== JournalApplicationStatus.PENDING) {
      return err(new Error(`Application has already been ${application.status.toLowerCase()}.`));
    }

    // Create the journal using the existing createJournal method
    const journalResult = await createJournal({
      name: application.name,
      description: application.description,
      ownerId: application.applicantId,
    });

    if (journalResult.isErr()) {
      return err(journalResult.error);
    }

    const journal = journalResult.value;

    // Update the journal with instructions from the application
    await prisma.journal.update({
      where: { id: journal.id },
      data: {
        authorInstruction: application.instructionsForAuthors,
        refereeInstruction: application.instructionsForReviewers,
      },
    });

    // Update the application status to APPROVED
    await prisma.journalApplication.update({
      where: { id: applicationId },
      data: { status: JournalApplicationStatus.APPROVED },
    });

    logger.info({ applicationId, journalId: journal.id, adminUserId }, 'Journal application approved');
    return ok(journal);
  } catch (error) {
    logger.error({ error, applicationId, adminUserId }, 'Failed to approve journal application');
    return err(error instanceof Error ? error : new Error('Failed to approve journal application'));
  }
}

async function rejectJournalApplication(
  applicationId: number,
  adminUserId: number,
): Promise<Result<JournalApplication, Error>> {
  try {
    const application = await prisma.journalApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      return err(new Error('Journal application not found.'));
    }

    if (application.status !== JournalApplicationStatus.PENDING) {
      return err(new Error(`Application has already been ${application.status.toLowerCase()}.`));
    }

    const updatedApplication = await prisma.journalApplication.update({
      where: { id: applicationId },
      data: { status: JournalApplicationStatus.REJECTED },
    });

    logger.info({ applicationId, adminUserId }, 'Journal application rejected');
    return ok(updatedApplication);
  } catch (error) {
    logger.error({ error, applicationId, adminUserId }, 'Failed to reject journal application');
    return err(error instanceof Error ? error : new Error('Failed to reject journal application'));
  }
}

async function getMyJournalApplications(userId: number): Promise<Result<JournalApplication[], Error>> {
  try {
    const applications = await prisma.journalApplication.findMany({
      where: { applicantId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return ok(applications);
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get user journal applications');
    return err(error instanceof Error ? error : new Error('Failed to get user journal applications'));
  }
}

interface ResubmitJournalApplicationInput {
  applicationId: number;
  applicantId: number;
  name: string;
  description: string;
  iconCid?: string;
  editorialBoard: { name: string; email: string; role: string }[];
  instructionsForAuthors: string;
  instructionsForReviewers: string;
}

async function resubmitJournalApplication(
  data: ResubmitJournalApplicationInput,
): Promise<Result<JournalApplication, Error>> {
  try {
    const existing = await prisma.journalApplication.findUnique({
      where: { id: data.applicationId },
    });

    if (!existing) {
      return err(new Error('Journal application not found.'));
    }

    if (existing.applicantId !== data.applicantId) {
      return err(new Error('You can only resubmit your own applications.'));
    }

    if (existing.status !== JournalApplicationStatus.REJECTED) {
      return err(new Error('Only rejected applications can be resubmitted.'));
    }

    const updated = await prisma.journalApplication.update({
      where: { id: data.applicationId },
      data: {
        name: data.name,
        description: data.description,
        editorialBoard: data.editorialBoard,
        instructionsForAuthors: data.instructionsForAuthors,
        instructionsForReviewers: data.instructionsForReviewers,
        status: JournalApplicationStatus.PENDING,
      },
    });

    // Send notification email to admin
    const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || 'no-reply@desci.com';
    const applicant = await prisma.user.findUnique({
      where: { id: data.applicantId },
      select: { name: true, email: true },
    });
    sendEmail({
      type: EmailTypes.JOURNAL_APPLICATION_SUBMITTED,
      payload: {
        to: ADMIN_NOTIFICATION_EMAIL,
        applicantName: applicant?.name || 'Unknown',
        applicantEmail: applicant?.email || 'Unknown',
        journalName: data.name,
        journalDescription: data.description,
      },
    }).catch((emailErr) => {
      logger.error({ emailErr, applicationId: updated.id }, 'Failed to send resubmission notification email');
    });

    logger.info({ applicationId: updated.id, applicantId: data.applicantId }, 'Journal application resubmitted');
    return ok(updated);
  } catch (error) {
    logger.error({ error, data }, 'Failed to resubmit journal application');
    return err(error instanceof Error ? error : new Error('Failed to resubmit journal application'));
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
  applyForJournal,
  listJournalApplications,
  approveJournalApplication,
  rejectJournalApplication,
  getMyJournalApplications,
  resubmitJournalApplication,
};
