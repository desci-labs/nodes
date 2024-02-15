import 'dotenv/config';
import 'mocha';
import {
  Attestation,
  // AttestationTemplate,
  AttestationVersion,
  CommunitySelectedAttestation,
  DesciCommunity,
  User,
} from '@prisma/client';
import { assert, expect } from 'chai';

import { prisma } from '../../src/client.js';
import { attestationService, communityService, DuplicateDataError } from '../../src/internal.js';
import { createUsers } from '../util.js';

const clearDatabase = async () => {
  await prisma.$queryRaw`TRUNCATE TABLE "DataReference" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
  await prisma.$queryRaw`TRUNCATE TABLE "Node" CASCADE;`;
};

describe('Desci Communities', () => {
  const moonDao = {
    name: 'Moon Dao',
    image_url:
      'https://assets-global.website-files.com/634742417f9e1c182c6697d4/634f55796f66af7ee884539f_logo-white.svg',
    description: 'MoonDAO is accelerating our multiplanetary future.',
  };
  let daoCommunity: DesciCommunity | null;

  let admin: User;
  let unauthedUser: User;
  let users: User[];

  const setupCommunity = async () => {
    await communityService.createCommunity(moonDao);
    daoCommunity = await communityService.findCommunityByNameOrSlug(moonDao.name);
  };

  const tearDownCommunity = async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "CommunityMember" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "DesciCommunity" CASCADE;`;
  };

  before(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    admin = await prisma.user.create({
      data: {
        email: 'admin@desci.com',
        name: 'MoonDAO admin',
      },
    });
    unauthedUser = await prisma.user.create({
      data: {
        email: 'bob@desci.com',
        name: 'Anonymous',
      },
    });
    users = await createUsers(5);
    await setupCommunity();
  });

  after(async () => {
    await clearDatabase();
    await tearDownCommunity();
  });

  describe('Creating a community', async () => {
    // let daoCommunity: DesciCommunity | null;
    // before(async () => {
    //   await communityService.createCommunity(admin.id, moonDao);
    //   daoCommunity = await communityService.findCommunityByNameOrSlug(moonDao.name);
    // });

    it('should create a community', async () => {
      // const [daoCommunity, moonDaoAdmin] =
      assert(daoCommunity, 'Community not created');
      expect(daoCommunity?.name).to.be.equal(moonDao.name);
      expect(daoCommunity?.image_url).to.be.equal(moonDao.image_url);
      expect(daoCommunity?.description).to.be.equal(moonDao.description);
    });

    it.skip('should assign creator as admin', async () => {
      assert(daoCommunity, 'daoCommunity is null');
      const moonDaoAdmin = await communityService.getCommunityAdmin(daoCommunity.id);
      expect(moonDaoAdmin?.userId).to.be.equal(admin.id);
      expect(moonDaoAdmin?.user.name).to.be.equal(admin.name);
    });
  });

  describe('Updating a community', () => {
    let updatedCommunity: DesciCommunity;

    before(async () => {
      assert(daoCommunity);
      updatedCommunity = await communityService.updateCommunity(daoCommunity.name, {
        description: 'No description',
        image_url: '',
        name: 'Dao community',
      });
      // updatedCommunity = results[0];
    });

    it('should update community', () => {
      expect(updatedCommunity.name).to.be.equal('Dao community');
      expect(updatedCommunity.image_url).to.be.equal('');
      expect(updatedCommunity.description).to.be.equal('No description');
    });
  });

  describe.skip('Community Membership', () => {
    // before()
    it('should add a member', () => {
      expect(true).to.be.true;
    });
    it('should remove a member', () => {
      expect(true).to.be.true;
    });
    it('should restrict updates to admin', async () => {
      expect(true).to.be.true;
    });
    it('should prevent removal of admin', () => {
      expect(true).to.be.true;
    });
  });

  describe('Community Attestation', () => {
    const attestationData = [
      {
        name: 'Reproducibility',
        description:
          'For research objects that provide the code and data needed to computationally reproduce key figures, tables and results.',
        image_url: 'http://image_pat.png',
      },
      {
        name: 'Open Data Access',
        description: 'For research objects that provide the code and data openly',
        image_url: 'http://image_pat.png',
      },
      {
        name: 'Fair Metadata',
        description:
          'For research objects that provide the code and data needed to computationally reproduce key figures, tables and results.',
        image_url: 'http://image_pat.png',
      },
    ];

    let attestation: Attestation;
    let attestation2: Attestation;

    before(async () => {
      assert(daoCommunity);
      [attestation, attestation2] = await Promise.all(
        attestationData.map((data) => attestationService.create({ communityId: daoCommunity?.id as number, ...data })),
      );
    });

    after(async () => {
      await prisma.$queryRaw`TRUNCATE TABLE "Attestation" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "AttestationVersion" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "AttestationTemplate" CASCADE;`;
      await prisma.$queryRaw`TRUNCATE TABLE "CommunitySelectedAttestation" CASCADE;`;
    });

    describe('Create Community Attestation', () => {
      it('should create attestation', async () => {
        assert(attestation);
        expect(attestation.name).to.be.equal(attestationData[0].name);
        expect(attestation.description).to.be.equal(attestationData[0].description);
        expect(attestation.image_url).to.be.equal(attestationData[0].image_url);
        expect(attestation.templateId).to.be.null;
      });

      it('should create attestation version', async () => {
        assert(attestation);
        const versions = await attestationService.getAttestationVersions(attestation.id);
        expect(versions.length).to.be.equal(1);
        const attestationVersion = versions[0];
        assert(attestationVersion);
        expect(attestationVersion.name).to.be.equal(attestationData[0].name);
        expect(attestationVersion.description).to.be.equal(attestationData[0].description);
        expect(attestationVersion.image_url).to.be.equal(attestationData[0].image_url);
      });

      it('should prevent duplicate attestation', async () => {
        try {
          assert(daoCommunity);
          await attestationService.create({ ...attestation });
        } catch (err) {
          expect(err).to.be.instanceOf(DuplicateDataError);
        }
      });
    });

    describe('Create Community Attestation From Template', () => {
      const templateData = {
        name: 'Template Attestation',
        description: 'Template Description',
        image_url: 'http://image_pat.png',
      };

      it('should create attestation from template', async () => {
        assert(daoCommunity);
        const template = await attestationService.createTemplate(templateData);
        const attestationFromTemplate = await attestationService.createAttestationFromTemplate(
          template.name,
          daoCommunity.id,
          {
            name: 'Custom attestation',
          },
        );

        assert(attestationFromTemplate);
        assert(template);
        expect(attestationFromTemplate.name).to.be.equal('Custom attestation');
        expect(attestationFromTemplate.description).to.be.equal(template.description);
        expect(attestationFromTemplate.image_url).to.be.equal(template.image_url);
        expect(attestationFromTemplate.templateId).to.be.equal(template.id);
      });

      it('should prevent duplicate attestation template', async () => {
        try {
          await attestationService.createTemplate(templateData);
        } catch (err) {
          expect(err).to.be.instanceOf(DuplicateDataError);
        }
      });
    });

    describe('Update Community Attestation', async () => {
      before(async () => {
        await attestationService.updateAttestation(attestation.id, { ...attestation, name: 'Update 1' });
      });

      it('should publish new attestation version(2)', async () => {
        const versions = await attestationService.getAttestationVersions(attestation.id);
        assert(versions);
        // console.log('version 2', versions);
        expect(versions.length).to.be.equal(2);
        expect(versions[1].name).be.equal('Update 1');
        expect(versions[1].description).be.equal(attestation.description);
        expect(versions[1].image_url).be.equal(attestation.image_url);
        expect(versions[1].attestationId).be.equal(attestation.id);
      });

      it('should publish attestation version 3', async () => {
        await attestationService.updateAttestation(attestation.id, {
          ...attestation,
          name: 'Update 2',
          image_url: 'http://version3',
        });
        const versions = await attestationService.getAttestationVersions(attestation.id);
        assert(versions);
        // console.log('version 3', versions);
        expect(versions.length).to.be.equal(3);
        expect(versions[2].name).be.equal('Update 2');
        expect(versions[2].description).be.equal(attestation.description);
        expect(versions[2].image_url).be.equal('http://version3');
        expect(versions[2].attestationId).be.equal(attestation.id);
      });

      it('should publish attestation version 4', async () => {
        await attestationService.updateAttestation(attestation.id, {
          ...attestation,
          description: 'Version 4 Description',
        });
        const versions = await attestationService.getAttestationVersions(attestation.id);
        // console.log('version 4', versions);
        assert(versions);
        expect(versions.length).to.be.equal(4);
        expect(versions[3].name).be.equal(attestation.name);
        expect(versions[3].description).be.equal('Version 4 Description');
        expect(versions[3].image_url).be.equal(attestation.image_url);
        expect(versions[3].attestationId).be.equal(attestation.id);
      });
    });

    describe('Community Selected Attestation', () => {
      let selectedAttestation: CommunitySelectedAttestation;
      let version: AttestationVersion;
      let selectedVersion: AttestationVersion;
      let selectedAttestation2: CommunitySelectedAttestation;

      before(async () => {
        assert(daoCommunity);
        assert(attestation);
        const versions = await attestationService.getAttestationVersions(attestation.id);
        version = versions[versions.length - 1];
        selectedAttestation = await attestationService.addCommunitySelectedAttestation({
          communityId: daoCommunity.id,
          attestationId: attestation.id,
          attestationVersion: version.id,
        });

        const versions2 = await attestationService.getAttestationVersions(attestation2.id);
        selectedVersion = versions2[versions2.length - 1];
        selectedAttestation2 = await attestationService.addCommunitySelectedAttestation({
          communityId: daoCommunity.id,
          attestationId: attestation2.id,
          attestationVersion: selectedVersion.id,
        });
      });

      it('should add attestation to community', () => {
        assert(daoCommunity);
        expect(selectedAttestation.attestationId).to.be.equal(attestation.id);
        expect(selectedAttestation.desciCommunityId).to.be.equal(daoCommunity.id);
        expect(selectedAttestation.required).to.be.equal(true);
        expect(selectedAttestation.attestationVersionId).to.be.equal(version.id);
      });

      it('should prevent duplicate community selected attestation', async () => {
        try {
          assert(daoCommunity);
          await attestationService.addCommunitySelectedAttestation({
            communityId: daoCommunity.id,
            attestationId: attestation.id,
            attestationVersion: version.id,
          });
        } catch (err) {
          expect(err).to.be.instanceOf(DuplicateDataError);
        }
      });

      it('should list all community selected attestations', async () => {
        assert(daoCommunity);
        const entryAttestations = await attestationService.getCommunityEntryAttestations(daoCommunity.id);
        expect(entryAttestations.length).to.be.equal(2);

        // check for first attestation properties
        expect(entryAttestations[0].id).to.be.equal(selectedAttestation.id);
        expect(entryAttestations[0].attestationId).to.be.equal(attestation.id);
        expect(entryAttestations[0].attestationVersionId).to.be.equal(version.id);

        // check for first attestation properties
        expect(entryAttestations[1].id).to.be.equal(selectedAttestation2.id);
        expect(entryAttestations[1].attestationId).to.be.equal(attestation2.id);
        expect(entryAttestations[1].attestationVersionId).to.be.equal(selectedVersion.id);
      });

      // it('should only curate nodes who claim entry requirement attestation(s)', () => {
      //   expect(true).to.be.false;
      // });

      // it('should allow member to claim all selected attestation(s)', () => {});
      // it('should allow member claim individual attestation(s)', () => {});
    });
  });
});
