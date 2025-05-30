import { PrismaClient, Submissionstatus } from '@prisma/client';

import { ensureUuidEndsWithDot } from '../src/utils.js';

const prisma = new PrismaClient();

function generateRandomName() {
  const adjectives = [
    'Amazing',
    'Brilliant',
    'Creative',
    'Dynamic',
    'Energetic',
    'Fascinating',
    'Global',
    'Innovative',
    'Jubilant',
    'Knowledgeable',
  ];
  const nouns = [
    'Scientists',
    'Researchers',
    'Explorers',
    'Pioneers',
    'Visionaries',
    'Thinkers',
    'Discoverers',
    'Innovators',
    'Scholars',
    'Experts',
  ];

  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNumber = Math.floor(Math.random() * 1000);

  return `${randomAdjective} ${randomNoun} ${randomNumber}`;
}

function generateRandomEmail() {
  const randomString = Math.random().toString(36).substring(2, 8);
  return `test-admin-${randomString}@test.com`;
}

function generateUniqueNodeUuid(index: number) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return ensureUuidEndsWithDot(`${timestamp}-${random}-${index}`);
}

async function createTestData() {
  try {
    const communityName = generateRandomName();
    const communitySlug = communityName.toLowerCase().replace(/\s+/g, '-');

    // Create a test community
    const community = await prisma.desciCommunity.create({
      data: {
        name: communityName,
        slug: communitySlug,
        description: 'A test community for development',
        keywords: ['test', 'development'],
        memberString: ['Test Admin'],
        links: ['https://test.com'],
        hidden: false,
        subtitle: 'Test Community Subtitle',
        image_url: 'https://pub.desci.com/ipfs/bafkreie7kxhzpzhsbywcrpgyv5yvy3qxcjsibuxsnsh5olaztl2uvnrzx4',
      },
    });

    console.log('Created community:', community);

    // Create a test admin user with random email
    const adminEmail = generateRandomEmail();
    const admin = await prisma.user.create({
      data: {
        name: 'Test Admin',
        email: adminEmail,
        pseudonym: `testadmin-${Math.random().toString(36).substring(2, 6)}`,
      },
    });

    console.log('Created admin user:', admin);

    // Add admin to community
    await prisma.communityMember.create({
      data: {
        userId: admin.id,
        communityId: community.id,
        role: 'ADMIN',
      },
    });

    // Create 100 test nodes
    const nodes = await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        const nodeUuid = generateUniqueNodeUuid(i);
        const node = await prisma.node.create({
          data: {
            uuid: nodeUuid,
            title: `Test Node ${i}`,
            ownerId: admin.id,
            manifestUrl: `https://test.com/manifest-${i}`,
            dpidAlias: i, // Using number for dpidAlias
            replicationFactor: 1, // Required field
            NodeCover: {
              create: {
                url: 'https://pub.desci.com/ipfs/bafkreie7kxhzpzhsbywcrpgyv5yvy3qxcjsibuxsnsh5olaztl2uvnrzx4',
              },
            },
            authors: {
              create: {
                userId: admin.id,
                shares: 100, // Full share for the admin
              },
            },
            restBody: JSON.stringify({
              authors: [
                {
                  name: admin.name,
                  id: admin.id.toString(),
                  orcid: admin.orcid || '',
                },
              ],
              publishedDate: new Date().toISOString(),
            }),
          },
        });

        // Create a published version for each node
        await prisma.nodeVersion.create({
          data: {
            nodeId: node.id,
            manifestUrl: node.manifestUrl,
            transactionId: `test-tx-${i}`,
            commitId: `test-commit-${i}`,
          },
        });

        return node;
      }),
    );

    console.log('Created test nodes:', nodes.length);

    // Create submissions with different statuses
    const submissions = await Promise.all(
      nodes.map(async (node, i) => {
        const status =
          i % 3 === 0 ? Submissionstatus.PENDING : i % 3 === 1 ? Submissionstatus.ACCEPTED : Submissionstatus.REJECTED;

        const submission = await prisma.communitySubmission.create({
          data: {
            nodeId: node.uuid || '', // Ensure nodeId is not null
            communityId: community.id,
            userId: admin.id,
            status,
            nodeVersion: 1,
            ...(status === Submissionstatus.ACCEPTED ? { acceptedAt: new Date() } : {}),
            ...(status === Submissionstatus.REJECTED
              ? {
                  rejectedAt: new Date(),
                  rejectionReason: 'Test rejection reason',
                }
              : {}),
          },
        });

        return submission;
      }),
    );

    console.log('Created submissions:', submissions.length);

    console.log('\nTest data created successfully!');
    console.log('Community ID:', community.id);
    console.log('Admin User ID:', admin.id);
    console.log('Total Nodes:', nodes.length);
    console.log('Total Submissions:', submissions.length);
    console.log(
      '\nSample Node UUIDs (first 5):',
      nodes.slice(0, 5).map((n) => n.uuid),
    );
    console.log(
      'Sample Submission IDs (first 5):',
      submissions.slice(0, 5).map((s) => s.id),
    );
  } catch (error) {
    console.error('Error creating test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestData();
