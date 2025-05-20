import { EditorRole } from '@prisma/client';
import { z } from 'zod';

export const getJournalSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val, ctx) => {
      const id = parseInt(val, 10);
      if (isNaN(id) || id <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Journal ID must be a positive integer.',
        });
        return z.NEVER;
      }
      return id;
    }),
  }),
});

export const inviteEditorSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val, ctx) => {
      const id = parseInt(val, 10);
      if (isNaN(id) || id <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Journal ID must be a positive integer.',
        });
        return z.NEVER;
      }
      return id;
    }),
  }),
  body: z.object({
    email: z.string().email(),
    role: z.nativeEnum(EditorRole),
  }),
});

export const editorInviteDecisionSchema = z.object({
  body: z.object({
    decision: z.enum(['accept', 'decline']),
    token: z.string(),
  }),
});

export const createJournalSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Journal name cannot be empty.'),
    description: z.string().optional(),
    iconCid: z.string().optional(),
  }),
});

export const updateEditorRoleSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
    editorId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    role: z.nativeEnum(EditorRole),
  }),
});

export const removeEditorSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
    editorId: z.string().transform((val) => parseInt(val, 10)),
  }),
});

export const updateJournalSchema = z.object({
  params: z.object({
    journalId: z.string().transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    name: z.string().min(1, 'Journal name cannot be empty.').optional(),
    description: z.string().optional(),
    iconCid: z.string().optional(),
  }),
});
