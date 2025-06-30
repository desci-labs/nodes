import { z } from 'zod';

// Schema for a single field option (for RADIO, CHECKBOX, SELECT)
const FormFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

// Base schema for any field in the form
const FormFieldSchema = z.object({
  id: z.string().min(1, 'Field ID cannot be empty.'),
  name: z.string().min(1, 'Field name cannot be empty.'),
  label: z.string().min(1, 'Field label cannot be empty.'),
  description: z.string().optional(),
  required: z.boolean().optional(),
  fieldType: z.enum([
    'TEXT',
    'TEXTAREA',
    'NUMBER',
    'BOOLEAN',
    'RADIO',
    'CHECKBOX',
    'SELECT',
    'SCALE',
    'RATING',
    'DATE',
  ]),
  validation: z
    .object({
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      pattern: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  options: z.array(FormFieldOptionSchema).optional(),
});

// Refine the FormFieldSchema to add conditional validation based on fieldType
const RefinedFormFieldSchema = FormFieldSchema.superRefine((field, ctx) => {
  if (['RADIO', 'CHECKBOX', 'SELECT'].includes(field.fieldType)) {
    if (!field.options || field.options.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Field "${field.name}" must have options.`,
        path: ['options'],
      });
    }
  }
});

// Schema for a section of the form
const FormSectionSchema = z.object({
  id: z.string().min(1, 'Section ID cannot be empty.'),
  title: z.string().min(1, 'Section title cannot be empty.'),
  description: z.string().optional(),
  fields: z.array(RefinedFormFieldSchema).min(1, 'Each section must have at least one field.'),
});

// Schema for the entire form structure
export const FormStructureSchema = z
  .object({
    sections: z.array(FormSectionSchema).min(1, 'Form must have at least one section.'),
  })
  .superRefine((structure, ctx) => {
    const fieldIds = new Set<string>();
    const fieldNames = new Set<string>();
    const sectionIds = new Set<string>();

    for (const section of structure.sections) {
      if (sectionIds.has(section.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate section ID: ${section.id}`,
          path: ['sections', section.id],
        });
      }
      sectionIds.add(section.id);

      for (const field of section.fields) {
        if (fieldIds.has(field.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate field ID: ${field.id}`,
            path: ['sections', section.id, 'fields', field.id],
          });
        }
        fieldIds.add(field.id);

        if (fieldNames.has(field.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate field name: ${field.name}`,
            path: ['sections', section.id, 'fields', field.name],
          });
        }
        fieldNames.add(field.name);
      }
    }
  });

// Infer TypeScript types from Zod schemas
export type FormField = z.infer<typeof FormFieldSchema>;
export type FormSection = z.infer<typeof FormSectionSchema>;
export type FormStructure = z.infer<typeof FormStructureSchema>;

/**
 * Dynamically generates a Zod schema to validate form responses against a given form structure.
 * @param structure The form structure template.
 * @returns A Zod object schema for validating responses.
 */
export function createResponseSchema(structure: FormStructure) {
  const shape: z.ZodRawShape = {};

  for (const section of structure.sections) {
    for (const field of section.fields) {
      let fieldSchema: z.ZodTypeAny;

      // Determine the base schema type
      switch (field.fieldType) {
        case 'TEXT':
        case 'TEXTAREA':
          fieldSchema = z.string();
          break;
        case 'NUMBER':
        case 'RATING':
        case 'SCALE':
          fieldSchema = z.number();
          break;
        case 'BOOLEAN':
          fieldSchema = z.boolean();
          break;
        case 'RADIO':
        case 'SELECT':
          fieldSchema = z.string();
          if (field.options) {
            const values = field.options.map((opt) => opt.value);
            fieldSchema = z.enum(values as [string, ...string[]]);
          }
          break;
        case 'CHECKBOX':
          fieldSchema = z.array(z.string());
          if (field.options) {
            const values = field.options.map((opt) => opt.value);
            fieldSchema = z.array(z.enum(values as [string, ...string[]]));
          }
          break;
        case 'DATE':
          fieldSchema = z.string().datetime();
          break;
        default:
          fieldSchema = z.any();
      }

      // Add validation rules from the template
      if (field.validation) {
        if (field.fieldType === 'TEXT' || field.fieldType === 'TEXTAREA') {
          const s = fieldSchema as z.ZodString;
          if (field.validation.minLength !== undefined) s.min(field.validation.minLength);
          if (field.validation.maxLength !== undefined) s.max(field.validation.maxLength);
          if (field.validation.pattern) s.regex(new RegExp(field.validation.pattern));
        } else if (['NUMBER', 'RATING', 'SCALE'].includes(field.fieldType)) {
          const n = fieldSchema as z.ZodNumber;
          if (field.validation.min !== undefined) n.min(field.validation.min);
          if (field.validation.max !== undefined) n.max(field.validation.max);
        }
      }

      // Handle optional vs. required fields
      if (!field.required) {
        fieldSchema = fieldSchema.optional();
      } else if (fieldSchema instanceof z.ZodString) {
        fieldSchema = fieldSchema.min(1, { message: `${field.label} is required` });
      } else if (fieldSchema instanceof z.ZodArray) {
        fieldSchema = fieldSchema.min(1, { message: `${field.label} is required` });
      }
      // For other types like number and boolean, their presence is the requirement, which Zod handles by default.

      const fieldResponseShape = z.object({
        fieldType: z.literal(field.fieldType),
        value: fieldSchema,
      });

      shape[field.id] = field.required ? fieldResponseShape : fieldResponseShape.optional();
    }
  }

  return z.object(shape);
}
