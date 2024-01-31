import { z } from 'zod';
import {
  ResearchObjectV1AuthorRole,
  ResearchObjectV1Dpid,
  ResearchObjectV1Organization,
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

export const manifestActionSchema = z.array(
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('Publish dPID'), dpid: dpid }),
    z.object({ type: z.literal('Update Title'), title: z.string() }),
    z.object({ type: z.literal('Update Description'), description: z.string() }),
    z.object({ type: z.literal('Update License'), defaultLicense: z.string() }),
    z.object({ type: z.literal('Update ResearchFields'), researchFields: z.array(z.string()) }),
    z.object({ type: z.literal('Add Component'), component: researchObject }),
    z.object({ type: z.literal('Delete Component'), path: z.string() }),
    z.object({ type: z.literal('Add Contributor'), author: contributor }),
    z.object({ type: z.literal('Remove Contributor'), contributorIndex: z.number() }),
    z.object({ type: z.literal('Pin Component'), componentIndex: z.number() }),
    z.object({ type: z.literal('UnPin Component'), componentIndex: z.number() }),
  ]),
);
