import { z } from 'zod';
import {
  ResearchObjectComponentType,
  ResearchObjectV1AuthorRole,
  ResearchObjectV1Component,
  ResearchObjectV1Dpid,
  ResearchObjectV1Organization,
  ManifestActions,
  ResearchObjectReference,
} from '@desci-labs/desci-models';

const researchObject = z
  .object({
    id: z.string(),
    version: z.union([z.literal('desci-nodes-0.1.0'), z.literal('desci-nodes-0.2.0'), z.literal(1)]),
    name: z.string(),
    payload: z.object({ path: z.string() }).passthrough(),
    components: z.array(z.object({ id: z.string() }).passthrough()),
  })
  .passthrough();

export interface ResearchObjectV1Author {
  name: string;
  orcid?: string | undefined;
  googleScholar?: string | undefined;
  role: ResearchObjectV1AuthorRole;
  organizations?: ResearchObjectV1Organization[] | undefined;
  github?: string | undefined;
}

const contributor: z.ZodType<ResearchObjectV1Author> = z.object({
  name: z.string(),
  orcid: z.string().optional(),
  googleScholar: z.string().optional(),
  role: z.nativeEnum(ResearchObjectV1AuthorRole),
  organizations: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  github: z.string().optional(),
});
// .passthrough();

const dpid: z.ZodType<ResearchObjectV1Dpid> = z.object({ prefix: z.string(), id: z.string() }).required();
const componentType = z.nativeEnum(ResearchObjectComponentType);
const componentTypeMap = z.record(componentType);

const commonPayloadSchema = z.object({
  title: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  description: z.string().optional(),
  licenseType: z.string().optional(),
  path: z.string().optional(),
  url: z.string().url().optional(),
});

const componentSchema: z.ZodType<ResearchObjectV1Component> = z
  .object({
    id: z.string(),
    name: z.string(),
    payload: commonPayloadSchema.passthrough(),
    type: z.union([componentType, componentTypeMap]),
    starred: z.boolean(),
  })
  .passthrough();

export const DPID_PATH_REGEX =
  /^https:\/\/(?<domain>dev-beta|beta)\.dpid\.org(?<dpid>\/\d+)(?<version>\/v\d+)?(?<path>\/root.*)?/m;

export const DOI_REGEX = /(https:\/\/doi.org\/)?(?<doi>10.\d{4,9}\/[-._;()/:A-Z0-9]+$)/i;

const referenceSchema: z.ZodType<ResearchObjectReference> = z
  .object({
    type: z.union([z.literal('doi'), z.literal('dpid')]),
    id: z.string().refine((id) => DPID_PATH_REGEX.test(id) || DOI_REGEX.test(id)),
  })
  .refine((arg) => {
    if (arg.type === 'doi') return DOI_REGEX.test(arg.id);
    return DPID_PATH_REGEX.test(arg.id);
  });

type Action = ManifestActions['type'];

export const actionsSchema = z.array(
  z.discriminatedUnion('type', [
    z.object({ type: z.literal<Action>('Publish Dpid'), dpid: dpid }),
    z.object({ type: z.literal<Action>('Remove Dpid') }),
    z.object({ type: z.literal<Action>('Update Title'), title: z.string() }),
    z.object({ type: z.literal<Action>('Update Description'), description: z.string() }),
    z.object({ type: z.literal<Action>('Update License'), defaultLicense: z.string() }),
    z.object({ type: z.literal<Action>('Update ResearchFields'), researchFields: z.array(z.string()) }),
    z.object({ type: z.literal<Action>('Add Component'), component: componentSchema }),
    z.object({ type: z.literal<Action>('Delete Component'), path: z.string() }),
    z.object({ type: z.literal<Action>('Update Component'), component: componentSchema }),
    z.object({ type: z.literal<Action>('Add Contributor'), author: contributor }),
    z.object({ type: z.literal<Action>('Add Contributors'), contributors: z.array(contributor) }),
    z.object({ type: z.literal<Action>('Set Contributors'), contributors: z.array(contributor) }),
    z.object({ type: z.literal<Action>('Remove Contributor'), contributorIndex: z.number() }),
    z.object({ type: z.literal<Action>('Pin Component'), componentIndex: z.number() }),
    z.object({ type: z.literal<Action>('UnPin Component'), componentIndex: z.number() }),
    z.object({ type: z.literal<Action>('Update CoverImage'), cid: z.string().optional() }),
    z.object({ type: z.literal<Action>('Add Reference'), reference: referenceSchema }),
    z.object({ type: z.literal<Action>('Add References'), references: z.array(referenceSchema) }),
    z.object({ type: z.literal<Action>('Delete Reference'), referenceId: z.string() }),
  ]),
);
