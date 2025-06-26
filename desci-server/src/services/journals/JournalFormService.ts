import {
  EditorRole,
  FormResponseStatus,
  JournalFormTemplate,
  JournalFormResponse,
  JournalEventLogAction,
} from '@prisma/client';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import {
  FormStructure,
  FormStructureSchema,
  createResponseSchema,
  FormField,
} from '../../schemas/journalsForm.schema.js';

import { JournalEventLogService } from './JournalEventLogService.js';

const logger = parentLogger.child({
  module: 'Journals::JournalFormService',
});

type FormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'RADIO'
  | 'CHECKBOX'
  | 'SELECT'
  | 'SCALE'
  | 'RATING'
  | 'DATE';

interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

interface BaseFormFieldResponse {
  fieldId: string;
  fieldType: FormFieldType;
}

interface TextFieldResponse extends BaseFormFieldResponse {
  fieldType: 'TEXT' | 'TEXTAREA';
  value: string;
}

interface NumberFieldResponse extends BaseFormFieldResponse {
  fieldType: 'NUMBER' | 'SCALE' | 'RATING';
  value: number;
}

interface BooleanFieldResponse extends BaseFormFieldResponse {
  fieldType: 'BOOLEAN';
  value: boolean;
}

interface SingleSelectFieldResponse extends BaseFormFieldResponse {
  fieldType: 'RADIO' | 'SELECT';
  value: string;
}

interface MultiSelectFieldResponse extends BaseFormFieldResponse {
  fieldType: 'CHECKBOX';
  value: string[];
}

interface DateFieldResponse extends BaseFormFieldResponse {
  fieldType: 'DATE';
  value: string; // ISO date string
}

type FormFieldResponse =
  | TextFieldResponse
  | NumberFieldResponse
  | BooleanFieldResponse
  | SingleSelectFieldResponse
  | MultiSelectFieldResponse
  | DateFieldResponse;

interface CreateFormTemplateData {
  journalId: number;
  name: string;
  description?: string;
  structure: FormStructure;
  version?: number;
}

interface UpdateFormTemplateData {
  name?: string;
  description?: string;
  isActive?: boolean;
  structure?: FormStructure;
}

type FieldResponseValue =
  | { fieldType: 'TEXT' | 'TEXTAREA' | 'DATE' | 'RADIO' | 'SELECT'; value: string }
  | { fieldType: 'NUMBER' | 'RATING' | 'SCALE'; value: number }
  | { fieldType: 'BOOLEAN'; value: boolean }
  | { fieldType: 'CHECKBOX'; value: string[] };

interface FormResponseData {
  [key: string]: FieldResponseValue;
}

/**
 * Create a new form template for a journal
 * Only chief editors can create form templates
 */
async function createFormTemplate(
  userId: number,
  data: CreateFormTemplateData,
): Promise<Result<JournalFormTemplate, Error>> {
  logger.trace({ userId, journalId: data.journalId }, 'Creating form template');

  try {
    // Check if user is a chief editor of the journal
    const editor = await prisma.journalEditor.findFirst({
      where: {
        userId,
        journalId: data.journalId,
        role: EditorRole.CHIEF_EDITOR,
      },
    });

    if (!editor) {
      logger.warn({ userId, journalId: data.journalId }, 'User is not a chief editor');
      return err(new Error('Only chief editors can create form templates'));
    }

    // Check if a template with the same name already exists for this journal
    const existingTemplate = await prisma.journalFormTemplate.findFirst({
      where: {
        journalId: data.journalId,
        name: data.name,
        isActive: true,
      },
    });

    if (existingTemplate) {
      logger.warn({ journalId: data.journalId, name: data.name }, 'Template with this name already exists');
      return err(new Error('A template with this name already exists'));
    }

    // Validate form structure with Zod
    const validationResult = FormStructureSchema.safeParse(data.structure);
    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors.map((e) => e.message).join(', ');
      return err(new Error(`Invalid form structure: ${errorMessage}`));
    }

    const newTemplate = await prisma.journalFormTemplate.create({
      data: {
        journalId: data.journalId,
        name: data.name,
        description: data.description,
        createdById: userId,
        structure: data.structure as unknown as any,
        version: data.version || 1,
      },
      include: {
        journal: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    logger.info({ userId, journalId: data.journalId, templateId: newTemplate.id }, 'Form template created');
    return ok(newTemplate);
  } catch (error) {
    logger.error({ error, userId, data }, 'Failed to create form template');
    return err(error instanceof Error ? error : new Error('Failed to create form template'));
  }
}

/**
 * Update an existing form template
 * Creates a new version if the template has been used
 */
async function updateFormTemplate(
  userId: number,
  templateId: number,
  data: UpdateFormTemplateData,
): Promise<Result<JournalFormTemplate, Error>> {
  logger.trace({ userId, templateId }, 'Updating form template');

  try {
    const template = await prisma.journalFormTemplate.findUnique({
      where: { id: templateId },
      include: {
        responses: { take: 1 },
        journal: true,
      },
    });

    if (!template) {
      logger.warn({ templateId }, 'Template not found');
      return err(new Error('Template not found'));
    }

    // Check if user is a chief editor
    const editor = await prisma.journalEditor.findFirst({
      where: {
        userId,
        journalId: template.journalId,
        role: EditorRole.CHIEF_EDITOR,
      },
    });

    if (!editor) {
      logger.warn({ userId, journalId: template.journalId }, 'User is not a chief editor');
      return err(new Error('Only chief editors can update form templates'));
    }

    // If template has been used, create a new version
    if (template.responses.length > 0) {
      logger.info({ templateId }, 'Template has been used, creating new version');

      // Deactivate current version
      await prisma.journalFormTemplate.update({
        where: { id: templateId },
        data: { isActive: false },
      });

      // Create new version with incremented version number
      const currentStructure = template.structure as unknown as FormStructure;
      const newTemplateResult = await createFormTemplate(userId, {
        journalId: template.journalId,
        name: data.name || template.name,
        description: data.description || template.description,
        structure: data.structure || currentStructure,
        version: template.version + 1,
      });

      return newTemplateResult;
    }

    // Otherwise, update in place if no form responses exist for the template
    const updateData: any = {
      name: data.name,
      description: data.description,
      isActive: data.isActive,
    };

    if (data.structure) {
      const validationResult = FormStructureSchema.safeParse(data.structure);
      if (!validationResult.success) {
        const errorMessage = validationResult.error.errors.map((e) => e.message).join(', ');
        return err(new Error(`Invalid form structure: ${errorMessage}`));
      }
      updateData.structure = data.structure;
    }

    const updatedTemplate = await prisma.journalFormTemplate.update({
      where: { id: templateId },
      data: updateData,
      include: {
        journal: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    logger.info({ userId, templateId }, 'Form template updated');
    return ok(updatedTemplate);
  } catch (error) {
    logger.error({ error, userId, templateId, data }, 'Failed to update form template');
    return err(error instanceof Error ? error : new Error('Failed to update form template'));
  }
}

/**
 * Get all active form templates for a journal
 */
async function getJournalFormTemplates(
  journalId: number,
  includeInactive = false,
): Promise<Result<JournalFormTemplate[], Error>> {
  logger.trace({ journalId, includeInactive }, 'Getting journal form templates');

  try {
    const templates = await prisma.journalFormTemplate.findMany({
      where: {
        journalId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: { responses: true },
        },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });

    return ok(templates);
  } catch (error) {
    logger.error({ error, journalId, includeInactive }, 'Failed to get journal form templates');
    return err(error instanceof Error ? error : new Error('Failed to get journal form templates'));
  }
}

/**
 * Get a specific form template
 */
async function getFormTemplate(templateId: number): Promise<Result<JournalFormTemplate, Error>> {
  logger.trace({ templateId }, 'Getting form template');

  try {
    const template = await prisma.journalFormTemplate.findUnique({
      where: { id: templateId },
      include: {
        journal: true,
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!template) {
      logger.warn({ templateId }, 'Template not found');
      return err(new Error('Template not found'));
    }

    return ok(template);
  } catch (error) {
    logger.error({ error, templateId }, 'Failed to get form template');
    return err(error instanceof Error ? error : new Error('Failed to get form template'));
  }
}

/**
 * Get or create a form response for a referee assignment
 */
async function getOrCreateFormResponse(
  userId: number,
  refereeAssignmentId: number,
  templateId: number,
): Promise<Result<JournalFormResponse, Error>> {
  logger.trace({ userId, refereeAssignmentId, templateId }, 'Getting or creating form response');

  try {
    const assignment = await prisma.refereeAssignment.findUnique({
      where: { id: refereeAssignmentId },
      include: {
        submission: {
          include: {
            journal: true,
          },
        },
        referee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!assignment) {
      logger.warn({ refereeAssignmentId }, 'Referee assignment not found');
      return err(new Error('Referee assignment not found'));
    }

    // Check if user is authorized to access this form response
    // Authorization rules:
    // 1. Referees can access (get/create) their own form responses
    // 2. Editors (chief or assigned) can only view existing form responses, not create new ones
    const isReferee = assignment.refereeId === userId;

    // Check if user is an editor of the journal
    const editor = await prisma.journalEditor.findFirst({
      where: {
        journalId: assignment.submission.journalId,
        userId: userId,
      },
    });

    const isAssignedEditor = assignment.submission.assignedEditorId === userId;
    const isChiefEditor = editor?.role === EditorRole.CHIEF_EDITOR;
    const isEditor = isAssignedEditor || isChiefEditor;

    // User must be either the referee or an editor to access the form response
    if (!isReferee && !isEditor) {
      logger.warn({ userId, refereeAssignmentId }, 'User not authorized to access form response');
      return err(new Error('User not authorized to access this form response'));
    }

    // Check if a response already exists
    let response = await prisma.journalFormResponse.findFirst({
      where: {
        refereeAssignmentId,
        templateId,
      },
      include: {
        template: true,
        RefereeAssignment: {
          include: {
            referee: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            submission: true,
          },
        },
      },
    });

    if (!response) {
      // Only referees can create new responses
      if (!isReferee) {
        logger.warn({ userId, refereeAssignmentId }, 'Editor attempted to create form response');
        return err(new Error('Form response not found. Only referees can create new form responses.'));
      }

      // Verify the template belongs to the journal
      const template = await prisma.journalFormTemplate.findFirst({
        where: {
          id: templateId,
          journalId: assignment.submission.journalId,
          isActive: true,
        },
      });

      if (!template) {
        logger.warn({ templateId, journalId: assignment.submission.journalId }, 'Template not found or inactive');
        return err(new Error('Form template not found or inactive'));
      }

      // Create a new response with empty form data
      response = await prisma.journalFormResponse.create({
        data: {
          templateId,
          refereeAssignmentId,
          status: FormResponseStatus.DRAFT,
          formData: {},
        },
        include: {
          template: true,
          RefereeAssignment: {
            include: {
              referee: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              submission: true,
            },
          },
        },
      });

      logger.info({ userId, responseId: response.id }, 'Created new form response');
    }

    return ok(response);
  } catch (error) {
    logger.error({ error, userId, refereeAssignmentId, templateId }, 'Failed to get or create form response');
    return err(error instanceof Error ? error : new Error('Failed to get or create form response'));
  }
}

/**
 * Save form response (auto-save functionality)
 */
async function saveFormResponse(
  userId: number,
  responseId: number,
  data: FormResponseData,
): Promise<Result<JournalFormResponse, Error>> {
  logger.trace({ userId, responseId }, 'Saving form response');

  try {
    const response = await prisma.journalFormResponse.findUnique({
      where: { id: responseId },
      include: {
        RefereeAssignment: true,
        template: true,
      },
    });

    if (!response) {
      logger.warn({ responseId }, 'Form response not found');
      return err(new Error('Form response not found'));
    }

    // Verify the user is the referee
    if (response.RefereeAssignment?.refereeId !== userId) {
      logger.warn({ userId, responseId }, 'User is not authorized to save this form response');
      return err(new Error('Unauthorized to save this form response'));
    }

    // Verify response is not already submitted
    if (response.status === FormResponseStatus.SUBMITTED) {
      logger.warn({ responseId }, 'Cannot modify a submitted form response');
      return err(new Error('Cannot modify a submitted form response'));
    }

    const templateStructure = response.template.structure as unknown as FormStructure;
    const responseSchema = createResponseSchema(templateStructure);

    // For saving, we allow partial data
    const validationResult = responseSchema.partial().safeParse(data);

    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return err(new Error(`Invalid form data: ${errorMessage}`));
    }

    // Update the response, merging with existing data
    const existingData = (response.formData as Record<string, unknown>) || {};
    const updatedFormData = { ...existingData, ...validationResult.data };

    const updatedResponse = await prisma.journalFormResponse.update({
      where: { id: responseId },
      data: {
        formData: updatedFormData,
        updatedAt: new Date(),
      },
      include: {
        template: true,
        RefereeAssignment: {
          include: {
            referee: {
              select: { id: true, name: true, email: true },
            },
            submission: true,
          },
        },
      },
    });

    logger.info({ userId, responseId }, 'Form response saved');
    return ok(updatedResponse);
  } catch (error) {
    logger.error({ error, userId, responseId, data }, 'Failed to save form response');
    return err(error instanceof Error ? error : new Error('Failed to save form response'));
  }
}

/**
 * Submit a completed form response
 */
async function submitFormResponse(
  userId: number,
  responseId: number,
  data: FormResponseData,
): Promise<Result<JournalFormResponse, Error>> {
  logger.trace({ userId, responseId }, 'Submitting form response');

  try {
    const response = await prisma.journalFormResponse.findUnique({
      where: { id: responseId },
      include: {
        RefereeAssignment: {
          include: {
            submission: true,
          },
        },
        template: true,
      },
    });

    if (!response || !response.RefereeAssignment) {
      logger.warn({ responseId }, 'Form response not found');
      return err(new Error('Form response not found'));
    }

    // Verify the user is the referee
    if (response.RefereeAssignment.refereeId !== userId) {
      logger.warn({ userId, responseId }, 'User is not authorized to submit this form response');
      return err(new Error('Unauthorized to submit this form response'));
    }

    // Verify response is not already submitted
    if (response.status === FormResponseStatus.SUBMITTED) {
      logger.warn({ responseId }, 'Form response already submitted');
      return err(new Error('Form response already submitted'));
    }

    // Get template structure
    const templateStructure = response.template.structure as unknown as FormStructure;
    const responseSchema = createResponseSchema(templateStructure);

    const validationResult = responseSchema.safeParse(data);

    if (!validationResult.success) {
      const issues = validationResult.error.flatten().fieldErrors;
      const firstError = Object.values(issues)[0]?.[0] || 'Form submission is invalid';
      return err(
        new Error(firstError, {
          cause: issues,
        }),
      );
    }

    // Save and submit - create the review if it doesn't exist
    await prisma.$transaction(async (tx) => {
      // Check if a review already exists for this assignment
      let review = await tx.journalSubmissionReview.findFirst({
        where: {
          refereeAssignmentId: response.refereeAssignmentId!,
        },
      });

      // Create review if it doesn't exist
      if (!review) {
        review = await tx.journalSubmissionReview.create({
          data: {
            submissionId: response.RefereeAssignment!.submissionId,
            journalId: response.RefereeAssignment!.journalId,
            refereeAssignmentId: response.refereeAssignmentId!,
            createdAt: new Date(),
          },
        });
      }

      // Update response with final data, status, and link to review
      await tx.journalFormResponse.update({
        where: { id: responseId },
        data: {
          formData: validationResult.data,
          status: FormResponseStatus.SUBMITTED,
          submittedAt: new Date(),
          reviewId: review.id,
        },
      });

      await JournalEventLogService.log({
        journalId: response.RefereeAssignment!.journalId,
        action: JournalEventLogAction.REVIEW_SUBMITTED,
        userId,
        submissionId: response.RefereeAssignment!.submissionId,
        details: {
          formResponseId: responseId,
          templateId: response.templateId,
          reviewId: review.id,
        },
      });
    });

    logger.info(
      { userId, responseId, submissionId: response.RefereeAssignment.submissionId },
      'Form response submitted',
    );

    const updatedResponse = await getFormResponse(responseId);
    return updatedResponse;
  } catch (error) {
    logger.error({ error, userId, responseId, data }, 'Failed to submit form response');
    return err(error instanceof Error ? error : new Error('Failed to submit form response'));
  }
}

/**
 * Get a specific form response
 */
async function getFormResponse(responseId: number): Promise<Result<JournalFormResponse, Error>> {
  logger.trace({ responseId }, 'Getting form response');

  try {
    const response = await prisma.journalFormResponse.findUnique({
      where: { id: responseId },
      include: {
        template: true,
        review: {
          include: {
            submission: true,
            refereeAssignment: {
              include: {
                referee: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        RefereeAssignment: {
          include: {
            referee: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            submission: true,
          },
        },
      },
    });

    if (!response) {
      logger.warn({ responseId }, 'Form response not found');
      return err(new Error('Form response not found'));
    }

    return ok(response);
  } catch (error) {
    logger.error({ error, responseId }, 'Failed to get form response');
    return err(error instanceof Error ? error : new Error('Failed to get form response'));
  }
}

/**
 * Get all form responses for a submission
 */
async function getSubmissionFormResponses(submissionId: number): Promise<Result<JournalFormResponse[], Error>> {
  logger.trace({ submissionId }, 'Getting submission form responses');

  try {
    const responses = await prisma.journalFormResponse.findMany({
      where: {
        OR: [
          {
            review: {
              submissionId,
            },
          },
          {
            RefereeAssignment: {
              submissionId,
            },
          },
        ],
      },
      include: {
        template: true,
        review: {
          include: {
            refereeAssignment: {
              include: {
                referee: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        RefereeAssignment: {
          include: {
            referee: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    return ok(responses);
  } catch (error) {
    logger.error({ error, submissionId }, 'Failed to get submission form responses');
    return err(error instanceof Error ? error : new Error('Failed to get submission form responses'));
  }
}

/**
 * Delete a form template (only if unused)
 */
async function deleteFormTemplate(userId: number, templateId: number): Promise<Result<void, Error>> {
  logger.trace({ userId, templateId }, 'Deleting form template');

  try {
    const template = await prisma.journalFormTemplate.findUnique({
      where: { id: templateId },
      include: {
        responses: { take: 1 },
      },
    });

    if (!template) {
      logger.warn({ templateId }, 'Template not found');
      return err(new Error('Template not found'));
    }

    // Check if user is a chief editor
    const editor = await prisma.journalEditor.findFirst({
      where: {
        userId,
        journalId: template.journalId,
        role: EditorRole.CHIEF_EDITOR,
      },
    });

    if (!editor) {
      logger.warn({ userId, journalId: template.journalId }, 'User is not a chief editor');
      return err(new Error('Only chief editors can delete form templates'));
    }

    if (template.responses.length > 0) {
      logger.warn({ templateId }, 'Cannot delete a template that has been used');
      return err(new Error('Cannot delete a template that has been used. Deactivate it instead.'));
    }

    await prisma.journalFormTemplate.delete({
      where: { id: templateId },
    });

    logger.info({ userId, templateId }, 'Form template deleted');
    return ok(undefined);
  } catch (error) {
    logger.error({ error, userId, templateId }, 'Failed to delete form template');
    return err(error instanceof Error ? error : new Error('Failed to delete form template'));
  }
}

/**
 * Get the form completion status for a referee assignment
 */
async function getRefereeFormStatus(refereeAssignmentId: number): Promise<
  Result<
    {
      expectedTemplates: JournalFormTemplate[];
      completedTemplateIds: number[];
      pendingTemplateIds: number[];
      formResponses: JournalFormResponse[];
    },
    Error
  >
> {
  logger.trace({ refereeAssignmentId }, 'Getting referee form status');

  try {
    const assignment = await prisma.refereeAssignment.findUnique({
      where: { id: refereeAssignmentId },
      include: {
        submission: {
          include: {
            journal: true,
          },
        },
      },
    });

    if (!assignment) {
      logger.warn({ refereeAssignmentId }, 'Referee assignment not found');
      return err(new Error('Referee assignment not found'));
    }

    // Get expected templates
    const expectedTemplates = await prisma.journalFormTemplate.findMany({
      where: {
        id: { in: assignment.expectedFormTemplateIds },
        journalId: assignment.journalId,
      },
    });

    // Get all form responses for this assignment
    const formResponses = await prisma.journalFormResponse.findMany({
      where: {
        refereeAssignmentId,
      },
      include: {
        template: true,
      },
    });

    // Determine which templates have been completed
    const completedTemplateIds = formResponses
      .filter((response) => response.status === FormResponseStatus.SUBMITTED)
      .map((response) => response.templateId);

    // Determine which templates are still pending
    const pendingTemplateIds = assignment.expectedFormTemplateIds.filter(
      (templateId) => !completedTemplateIds.includes(templateId),
    );

    return ok({
      expectedTemplates,
      completedTemplateIds,
      pendingTemplateIds,
      formResponses,
    });
  } catch (error) {
    logger.error({ error, refereeAssignmentId }, 'Failed to get referee form status');
    return err(error instanceof Error ? error : new Error('Failed to get referee form status'));
  }
}

export const JournalFormService = {
  createFormTemplate,
  updateFormTemplate,
  getJournalFormTemplates,
  getFormTemplate,
  getOrCreateFormResponse,
  saveFormResponse,
  submitFormResponse,
  getFormResponse,
  getSubmissionFormResponses,
  deleteFormTemplate,
  getRefereeFormStatus,
};

export type { CreateFormTemplateData, UpdateFormTemplateData, FormResponseData };
