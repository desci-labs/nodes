import 'mocha';
import {
  CodeComponent,
  ExternalLinkComponent,
  ResearchObjectComponentCodeSubtype,
  ResearchObjectComponentType,
  ResearchObjectV1Author,
  ResearchObjectV1AuthorRole,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import { expect } from 'chai';
import { ZodError } from 'zod';

import { actionsSchema } from '../../validators/schema.js';

describe('ManifestActions Schema', () => {
  describe('Valid Actions', () => {
    it('should reject Unknown action type', () => {
      const validate = () => actionsSchema.parse([{ type: 'Unknown Action', title: 'No title' }]);
      expect(validate).to.throw(ZodError);

      try {
        validate();
      } catch (err) {
        expect(err instanceof ZodError).to.be.true;
      }
    });
  });

  describe('Validate Title', () => {
    it('should validate title action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Update Title', title: 'No title' }]);
      console.log(validated);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid title action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Update Title', invalidKey: '' }]);
      console.log(validated);
      expect(validated.success).to.be.false;
    });
  });

  describe('Publish Dpid', () => {
    it('should validate dPID action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Publish Dpid', dpid: { prefix: 'beta', id: '1' } }]);
      console.log(validated);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid dPID action data', () => {
      const validated = actionsSchema.safeParse([{ type: 'Publish Dpid', dpid: { prefix: 'beta', ids: '1' } }]);
      console.log(validated);
      expect(validated.success).to.be.false;
    });

    it('should reject invalid dPID action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Publish Dpid', invalidKey: '' }]);
      console.log(validated);
      expect(validated.success).to.be.false;
    });
  });

  describe('Remove Dpid', () => {
    it('should validate dPID action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Remove Dpid' }]);
      expect(validated.success).to.be.true;
    });
  });

  describe('Validate Description', () => {
    it('should validate description action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Update Description', description: 'No title' }]);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid description action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Update Description', unknownKey: '' }]);
      expect(validated.success).to.be.false;
    });
  });

  describe('Validate License', () => {
    it('should validate License action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Update License', defaultLicense: 'No title' }]);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid License action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Update License', unknownKey: '' }]);
      expect(validated.success).to.be.false;
    });
  });

  describe('Validate ResearchFields', () => {
    it('should validate ResearchFields action', () => {
      const validated = actionsSchema.safeParse([
        { type: 'Update ResearchFields', researchFields: ['Cancer treatment'] },
      ]);
      expect(validated.success).to.be.true;
    });

    it('should validate empty ResearchFields action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Update ResearchFields', researchFields: [] }]);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid ResearchFields action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Update ResearchFields', unknownKey: '' }]);
      expect(validated.success).to.be.false;
    });
  });

  describe('Component Actions', () => {
    const researchObjectComponent: ResearchObjectV1Component = {
      id: 'uuid',
      name: 'Document',
      type: ResearchObjectComponentType.PDF,
      payload: { path: 'root/doc.pdf', title: 'title' },
      starred: true,
    };

    const linkComponent: ExternalLinkComponent = {
      name: 'Link',
      id: 'id',
      starred: false,
      type: ResearchObjectComponentType.LINK,
      payload: { path: 'root/external links/', url: 'https://google.com' },
    };

    const codeComponent: CodeComponent = {
      name: 'code name',
      id: 'id',
      starred: false,
      type: ResearchObjectComponentType.CODE,
      subtype: ResearchObjectComponentCodeSubtype.SOFTWARE_PACKAGE,
      payload: {
        path: 'root/external links/',
        cid: 'bafybeicrsddlvfbbo5s3upvjbtb5flc73iupxfy2kf3rv43kkbvegbqbwq',
        language: 'typescript',
      },
    };

    it('should validate Add Component action', async () => {
      const validated = await actionsSchema.safeParseAsync([
        { type: 'Add Component', component: researchObjectComponent },
      ]);
      // console.log(validated.success ? validated.data[0]['component']['payload'] : validated.error);
      expect(validated.success).to.be.true;
    });

    it('should validate Add Link Component action', async () => {
      const validated = await actionsSchema.safeParseAsync([{ type: 'Add Component', component: linkComponent }]);
      console.log(
        validated.success
          ? validated.data
          : {
              issues: validated.error.issues,
              path: validated.error.errors[0].path,
              // errors: validated.error.errors[0].path,
              formErrors: validated.error.formErrors.fieldErrors,
            },
      );
      expect(validated.success).to.be.true;
    });

    it('should validate Add Code Component action', async () => {
      const validated = await actionsSchema.safeParseAsync([{ type: 'Add Component', component: codeComponent }]);
      console.log(
        validated.success
          ? validated.data
          : {
              issues: validated.error.issues,
              path: validated.error.errors[0].path,
              // errors: validated.error.errors[0].path,
              formErrors: validated.error.formErrors.fieldErrors,
            },
      );
      expect(validated.success).to.be.true;
    });

    it('should reject Invalid Add Code Component action', async () => {
      const invalidComponent = {
        // name: 'code name',
        id: 'id',
        starred: false,
        type: ResearchObjectComponentType.CODE,
        subtype: ResearchObjectComponentCodeSubtype.SOFTWARE_PACKAGE,
        payload: {
          path: 'root/external links/',
          cid: 'bafybeicrsddlvfbbo5s3upvjbtb5flc73iupxfy2kf3rv43kkbvegbqbwq',
          language: 'typescript',
        },
      };

      const validated = await actionsSchema.safeParseAsync([{ type: 'Add Component', component: invalidComponent }]);
      // console.log(
      //   validated.success
      //     ? validated.data[0]['component']['payload']
      //     : {
      //         issues: validated.error.issues,
      //       },
      // );
      expect(validated.success).to.be.false;
    });

    it('should reject invalid Add Component action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Add Component', unknownKey: '' }]);
      expect(validated.success).to.be.false;
    });

    it('should validate Delete Component action', async () => {
      const validated = await actionsSchema.safeParseAsync([{ type: 'Delete Component', path: 'root/document' }]);
      console.log(validated.success ? validated.data : validated.error);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid Delete Component action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Delete comp', unknownKey: '' }]);
      expect(validated.success).to.be.false;
    });
  });

  describe('Contributor Actions', () => {
    const author: ResearchObjectV1Author = {
      name: 'Sandra Sanchez‐Roige',
      role: ResearchObjectV1AuthorRole.AUTHOR,
      organizations: [
        {
          name: 'University of California, San Diego',
          id: 'https://ror.org/0168r3w48',
        },
        {
          name: 'Vanderbilt University Medical Center',
          id: 'https://ror.org/05dq2gs74',
        },
      ],
      orcid: '0000-0001-6137-0000',
    };
    // const author: ResearchObjectV1Author = {
    //   name: 'Tay',
    //   role: ResearchObjectV1AuthorRole.AUTHOR,
    //   orcid: ''
    // };

    it('should validate Add Contributor', async () => {
      const validated = await actionsSchema.safeParseAsync([{ type: 'Add Contributor', author }]);
      console.log(validated.success ? validated.data : validated.error);
      expect(validated.success).to.be.true;
    });

    it('should validate Set Contributors', async () => {
      const validated = await actionsSchema.safeParseAsync([{ type: 'Add Contributors', contributors: [author] }]);
      console.log(validated.success ? validated.data : validated.error);
      expect(validated.success).to.be.true;
    });

    it('should validate Add Contributors', async () => {
      const validated = await actionsSchema.safeParseAsync([{ type: 'Add Contributors', contributors: [author] }]);
      console.log(validated.success ? validated.data : validated.error);
      expect(validated.success).to.be.true;
    });

    it('should validate Remove Contributor', async () => {
      const validated = await actionsSchema.safeParseAsync([{ type: 'Remove Contributor', contributorIndex: 0 }]);
      console.log(validated.success ? validated.data : validated.error);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid Add Contributor action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Add Contributor', unknownKey: '' }]);
      expect(validated.success).to.be.false;
    });

    it('should reject invalid Remove Contributor action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Remove Contributor', unknownKey: '' }]);
      expect(validated.success).to.be.false;
    });
  });

  describe('Pin Component', () => {
    it('should validate Pin component action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Pin Component', componentIndex: 5 }]);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid Pin component action', () => {
      const validated = actionsSchema.safeParse([{ type: 'Pin Componentss', componentIndex: 5 }]);
      expect(validated.success).to.be.false;
    });

    it('should validate UnPin component action', () => {
      const validated = actionsSchema.safeParse([{ type: 'UnPin Component', componentIndex: 5 }]);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid UnPin component action', () => {
      const validated = actionsSchema.safeParse([{ type: 'UnPin Component', unknownKey: '' }]);
      expect(validated.success).to.be.false;
    });
  });

  describe('ResearchObject References', () => {
    it('should validate add new reference', () => {
      let validated = actionsSchema.safeParse([
        { type: 'Add Reference', reference: { id: 'https://doi.org/10.1111/af325', type: 'doi', title: 'node title' } },
      ]);
      expect(validated.success).to.be.true;

      validated = actionsSchema.safeParse([
        { type: 'Add Reference', reference: { id: 'https://beta.dpid.org/165', type: 'dpid', title: 'node title' } },
      ]);
      console.log('error' in validated && validated.error);
      expect(validated.success).to.be.true;
    });

    it('should validate add new references', () => {
      const validated = actionsSchema.safeParse([
        {
          type: 'Add References',
          references: [
            { id: 'https://doi.org/10.1111/af325', type: 'doi', title: 'node title' },
            { id: 'https://beta.dpid.org/165/v6', type: 'dpid', title: 'node title' },
          ],
        },
      ]);
      expect(validated.success).to.be.true;
    });

    it('should validate ovewriting references', () => {
      const validated = actionsSchema.safeParse([
        {
          type: 'Set References',
          references: [
            { id: 'https://doi.org/10.1111/af325', type: 'doi', title: 'node title' },
            { id: 'https://beta.dpid.org/165/v6', type: 'dpid', title: 'node title' },
          ],
        },
      ]);
      expect(validated.success).to.be.true;
    });

    it('should reject invalid references', () => {
      const validated = actionsSchema.safeParse([
        {
          type: 'Add References',
          references: [
            { id: 'https://doi/10.111/af325', type: 'doi', title: 'node title' },
            { id: 'https://dpid.org/165', type: 'dpid', title: 'node title' },
          ],
        },
      ]);
      expect(validated.success).to.be.false;
    });

    it('should reject reference Id/type mismatch', () => {
      const validated = actionsSchema.safeParse([
        {
          type: 'Add References',
          references: [
            { id: 'https://doi/10.111/af325', type: 'dpid', title: 'node title' },
            { id: 'https://dpid.org/165', type: 'doi', title: 'node title' },
          ],
        },
      ]);
      expect(validated.success).to.be.false;
    });

    it('should reject invalid actions payload', () => {
      let validated = actionsSchema.safeParse([
        {
          type: 'Add Reference',
          reference: [{ id: 'https://doi.org/10.1111/af325', type: 'doi', title: 'node title' }],
        },
      ]);
      expect(validated.success).to.be.false;

      validated = actionsSchema.safeParse([
        { type: 'Add Reference', reference: { type: 'dpid', title: 'node title' } },
      ]);
      expect(validated.success).to.be.false;

      validated = actionsSchema.safeParse([
        {
          type: 'Add References',
          references: { id: 'https://dpid.org/165', type: 'dpid', title: 'node title' },
        },
      ]);
      expect(validated.success).to.be.false;
    });

    it('should validate delete existing reference', () => {
      const validated = actionsSchema.safeParse([
        { type: 'Delete Reference', referenceId: 'https://doi.org/10.111/af325' },
      ]);
      expect(validated.success).to.be.true;
    });
  });

  // describe("ResearchObject References", () => {
  //   it('should add new reference', () => {})
  //   it('should not add duplicate reference', () => {})
  //   it('should add new references', () => {})
  //   it('should not add duplicate references', () => {})
  //   it('should delete existing reference', () => {})
  // })
});
