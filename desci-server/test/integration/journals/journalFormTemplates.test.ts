import 'mocha';
import {
  Journal,
  User,
  JournalSubmission,
  RefereeAssignment,
  EditorRole,
  Node,
  JournalFormTemplate,
  FormResponseStatus,
} from '@prisma/client';
import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { prisma } from '../../../src/client.js';
import { server } from '../../../src/server.js';
import { JournalFormService } from '../../../src/services/journals/JournalFormService.js';
import { JournalManagementService } from '../../../src/services/journals/JournalManagementService.js';
import { JournalRefereeManagementService } from '../../../src/services/journals/JournalRefereeManagementService.js';
import { journalSubmissionService } from '../../../src/services/journals/JournalSubmissionService.js';
import { publishMockNode } from '../../util.js';

import { VALID_FORM_STRUCTURE } from './formMockData.js';

server.ready().then((_) => {
  console.log('server is ready');
});
export const app = server.app;

describe.only('Journal Form Template Service & Endpoints', () => {
  let chiefEditor: User;
  let associateEditor: User;
  let refereeUser: User;
  let authorUser: User;
  let journal: Journal;
  let submission: JournalSubmission;
  let assignment: RefereeAssignment;
  let testNode: Node;

  let chiefEditorAuthToken: string;
  let associateEditorAuthToken: string;
  let refereeUserAuthToken: string;
  let authorUserAuthToken: string;

  beforeEach(async () => {
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "Journal" CASCADE;`;

    // Create users
    chiefEditor = await prisma.user.create({
      data: { email: 'chief@example.com', name: 'Chief Editor' },
    });
    associateEditor = await prisma.user.create({
      data: { email: 'associate@example.com', name: 'Associate Editor' },
    });
    refereeUser = await prisma.user.create({
      data: { email: 'referee@example.com', name: 'Referee User' },
    });
    authorUser = await prisma.user.create({
      data: { email: 'author@example.com', name: 'Author User' },
    });

    // Create auth tokens
    chiefEditorAuthToken = jwt.sign({ email: chiefEditor.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    associateEditorAuthToken = jwt.sign({ email: associateEditor.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    refereeUserAuthToken = jwt.sign({ email: refereeUser.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });
    authorUserAuthToken = jwt.sign({ email: authorUser.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    // Create a journal
    const journalResult = await JournalManagementService.createJournal({
      name: 'Test Journal for Forms',
      ownerId: chiefEditor.id,
    });
    if (journalResult.isErr()) throw journalResult.error;
    journal = journalResult.value;

    // Add associate editor to the journal
    await prisma.journalEditor.create({
      data: {
        journalId: journal.id,
        userId: associateEditor.id,
        role: EditorRole.ASSOCIATE_EDITOR,
        inviterId: chiefEditor.id,
        acceptedAt: new Date(),
      },
    });

    // Create a dummy node and a Dpid record
    const testNodeDraft = await prisma.node.create({
      data: {
        title: 'Test Submission Node',
        uuid: 'test-node-uuid-forms' + Math.random().toString(36).substring(7),
        manifestUrl: 'test-manifest-url',
        replicationFactor: 0,
        ownerId: authorUser.id,
      },
    });
    await publishMockNode(testNodeDraft, new Date());
    testNode = (await prisma.node.findUnique({ where: { id: testNodeDraft.id } })) as Node;

    // Create submission
    const submissionPayload = {
      journalId: journal.id,
      authorId: authorUser.id,
      dpid: testNode.dpidAlias!,
      version: 1,
    };
    const createdSubmission = await journalSubmissionService.createSubmission(submissionPayload);

    // Assign editor
    const assignedSubmission = await journalSubmissionService.assignSubmissionToEditor({
      submissionId: createdSubmission.id,
      editorId: associateEditor.id,
      assignerId: chiefEditor.id,
    });

    submission = { ...createdSubmission, ...assignedSubmission };

    // Assign referee
    const assignmentResult = await JournalRefereeManagementService.assignReferee({
      submissionId: submission.id,
      refereeUserId: refereeUser.id,
      managerId: associateEditor.id,
      dueDateHrs: 24,
      journalId: journal.id,
    });
    if (assignmentResult.isErr()) throw assignmentResult.error;
    assignment = assignmentResult.value;
  });

  describe('createFormTemplate', () => {
    it('should allow a chief editor to create a form template', async () => {
      const res = await request(app)
        .post(`/v1/journals/${journal.id}/forms/templates`)
        .set('authorization', `Bearer ${chiefEditorAuthToken}`)
        .send({
          name: 'Review Form',
          description: 'Standard review form',
          structure: VALID_FORM_STRUCTURE,
        });

      expect(res.status).to.equal(200);
      expect(res.body.ok).to.be.true;
      const { template } = res.body.data;
      expect(template.name).to.equal('Review Form');
      expect(template.createdById).to.equal(chiefEditor.id);
      expect(template.journalId).to.equal(journal.id);
    });

    it('should not allow an associate editor to create a form template', async () => {
      const res = await request(app)
        .post(`/v1/journals/${journal.id}/forms/templates`)
        .set('authorization', `Bearer ${associateEditorAuthToken}`)
        .send({
          name: 'Review Form',
          description: 'Standard review form',
          structure: VALID_FORM_STRUCTURE,
        });

      expect(res.status).to.equal(403);
    });

    it('should reject a template with an invalid structure', async () => {
      const res = await request(app)
        .post(`/v1/journals/${journal.id}/forms/templates`)
        .set('authorization', `Bearer ${chiefEditorAuthToken}`)
        .send({
          name: 'Invalid Form',
          structure: { sections: [] }, // Invalid, must have sections
        });

      expect(res.status).to.equal(400);
      expect(res.body.message).to.include('Form must have at least one section');
    });
  });

  describe('listFormTemplates', () => {
    beforeEach(async () => {
      // Create a couple of templates
      const activeTemplate = await JournalFormService.createFormTemplate(chiefEditor.id, {
        journalId: journal.id,
        name: 'Active Template',
        structure: VALID_FORM_STRUCTURE,
      });
      const preInactiveTemplateRes = await JournalFormService.createFormTemplate(chiefEditor.id, {
        journalId: journal.id,
        name: 'Inactive Template',
        structure: VALID_FORM_STRUCTURE,
      });
      if (preInactiveTemplateRes.isErr()) throw preInactiveTemplateRes.error;
      const preInactiveTemplate = preInactiveTemplateRes.value;
      await prisma.journalFormTemplate.update({
        where: { id: preInactiveTemplate.id },
        data: { isActive: false },
      });
    });

    it('should list all active templates by default', async () => {
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/templates`)
        .set('authorization', `Bearer ${associateEditorAuthToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.data.templates).to.be.an('array').with.lengthOf(1);
      expect(res.body.data.templates[0].name).to.equal('Active Template');
    });

    it('should list all templates when activeOnly is false', async () => {
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/templates?includeInactive=true`)
        .set('authorization', `Bearer ${chiefEditorAuthToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.data.templates).to.be.an('array').with.lengthOf(2);
    });
  });

  describe('getFormTemplate (show)', () => {
    let template: JournalFormTemplate;

    beforeEach(async () => {
      const templateResult = await JournalFormService.createFormTemplate(chiefEditor.id, {
        journalId: journal.id,
        name: 'Test Template',
        description: 'Template for testing show route',
        structure: VALID_FORM_STRUCTURE,
      });
      if (templateResult.isErr()) throw templateResult.error;
      template = templateResult.value;

      // Add template to referee assignment expectedFormTemplateIds
      await prisma.refereeAssignment.update({
        where: { id: assignment.id },
        data: { expectedFormTemplateIds: [template.id] },
      });
    });

    it('should allow a chief editor to view a template', async () => {
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/templates/${template.id}`)
        .set('authorization', `Bearer ${chiefEditorAuthToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.ok).to.be.true;
      const { template: responseTemplate } = res.body.data;
      expect(responseTemplate.id).to.equal(template.id);
      expect(responseTemplate.name).to.equal('Test Template');
      expect(responseTemplate.description).to.equal('Template for testing show route');
    });

    it('should allow an associate editor to view a template', async () => {
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/templates/${template.id}`)
        .set('authorization', `Bearer ${associateEditorAuthToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.ok).to.be.true;
      const { template: responseTemplate } = res.body.data;
      expect(responseTemplate.id).to.equal(template.id);
      expect(responseTemplate.name).to.equal('Test Template');
    });

    it('should allow a referee with the template assigned to view it', async () => {
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/templates/${template.id}`)
        .set('authorization', `Bearer ${refereeUserAuthToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.ok).to.be.true;
      const { template: responseTemplate } = res.body.data;
      expect(responseTemplate.id).to.equal(template.id);
      expect(responseTemplate.name).to.equal('Test Template');
    });

    it('should not allow a referee without the template assigned to view it', async () => {
      // Create another referee not assigned to this template
      const otherReferee = await prisma.user.create({
        data: { email: 'other-referee@example.com', name: 'Other Referee' },
      });
      const otherRefereeToken = jwt.sign({ email: otherReferee.email }, process.env.JWT_SECRET!, { expiresIn: '1h' });

      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/templates/${template.id}`)
        .set('authorization', `Bearer ${otherRefereeToken}`);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Not authorized to view this template');
    });

    it('should not allow an unauthorized user to view a template', async () => {
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/templates/${template.id}`)
        .set('authorization', `Bearer ${authorUserAuthToken}`);

      expect(res.status).to.equal(403);
      expect(res.body.message).to.equal('Not authorized to view this template');
    });

    it('should return 404 for non-existent template', async () => {
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/templates/99999`)
        .set('authorization', `Bearer ${chiefEditorAuthToken}`);

      expect(res.status).to.equal(404);
      expect(res.body.message).to.equal('Template not found');
    });

    it('should return 404 if template belongs to a different journal', async () => {
      // Create another journal and template
      const otherJournalResult = await JournalManagementService.createJournal({
        name: 'Other Journal',
        ownerId: chiefEditor.id,
      });
      if (otherJournalResult.isErr()) throw otherJournalResult.error;
      const otherJournal = otherJournalResult.value;

      const res = await request(app)
        .get(`/v1/journals/${otherJournal.id}/forms/templates/${template.id}`)
        .set('authorization', `Bearer ${chiefEditorAuthToken}`);

      expect(res.status).to.equal(404);
      expect(res.body.message).to.equal('Template not found in this journal');
    });
  });

  describe('getOrCreateFormResponse', () => {
    let template: JournalFormTemplate;
    beforeEach(async () => {
      const templateResult = await JournalFormService.createFormTemplate(chiefEditor.id, {
        journalId: journal.id,
        name: 'Test Form',
        structure: VALID_FORM_STRUCTURE,
      });
      if (templateResult.isErr()) throw templateResult.error;
      template = templateResult.value;
    });

    it('should allow the assigned referee to create a new form response', async () => {
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/response/${assignment.id}/${template.id}`)
        .set('authorization', `Bearer ${refereeUserAuthToken}`);

      expect(res.status).to.equal(200);
      const { formResponse } = res.body.data;
      expect(formResponse.refereeAssignmentId).to.equal(assignment.id);
      expect(formResponse.templateId).to.equal(template.id);
      expect(formResponse.status).to.equal(FormResponseStatus.DRAFT);
    });

    it('should allow the assigned referee to retrieve an existing form response', async () => {
      // First, create the response
      await request(app)
        .get(`/v1/journals/${journal.id}/forms/response/${assignment.id}/${template.id}`)
        .set('authorization', `Bearer ${refereeUserAuthToken}`);

      // Then, retrieve it
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/response/${assignment.id}/${template.id}`)
        .set('authorization', `Bearer ${refereeUserAuthToken}`);

      expect(res.status).to.equal(200);
    });

    it('should allow an editor to retrieve an existing form response', async () => {
      await request(app)
        .get(`/v1/journals/${journal.id}/forms/response/${assignment.id}/${template.id}`)
        .set('authorization', `Bearer ${refereeUserAuthToken}`);

      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/response/${assignment.id}/${template.id}`)
        .set('authorization', `Bearer ${associateEditorAuthToken}`);

      expect(res.status).to.equal(200);
    });

    it('should NOT allow an editor to create a new form response', async () => {
      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/response/${assignment.id}/${template.id}`)
        .set('authorization', `Bearer ${associateEditorAuthToken}`);

      expect(res.status).to.equal(404);
      expect(res.body.error).to.include('Form response not found');
    });
  });

  describe('saveAndSubmitFormResponse', () => {
    let template: JournalFormTemplate;
    let response;

    beforeEach(async () => {
      const templateResult = await JournalFormService.createFormTemplate(chiefEditor.id, {
        journalId: journal.id,
        name: 'Test Form',
        structure: VALID_FORM_STRUCTURE,
      });
      if (templateResult.isErr()) throw templateResult.error;
      template = templateResult.value;

      const res = await request(app)
        .get(`/v1/journals/${journal.id}/forms/response/${assignment.id}/${template.id}`)
        .set('authorization', `Bearer ${refereeUserAuthToken}`);

      response = res.body.data.formResponse;
    });

    it('should allow the referee to save a draft response', async () => {
      const formData = {
        field_1: { fieldType: 'TEXTAREA', value: 'This is a test summary.' },
      };

      const res = await request(app)
        .put(`/v1/journals/${journal.id}/forms/response/${response.id}`)
        .set('authorization', `Bearer ${refereeUserAuthToken}`)
        .send({ fieldResponses: formData });

      expect(res.status).to.equal(200);
      const { saved: savedResponse } = res.body.data;

      expect(savedResponse.status).to.equal(FormResponseStatus.DRAFT);
      expect(savedResponse.formData.field_1.value).to.equal('This is a test summary.');
    });

    it('should allow the referee to submit a completed response', async () => {
      const formData = {
        field_1: { fieldType: 'TEXTAREA', value: 'This is a complete summary.' },
        field_2: { fieldType: 'RATING', value: 4 },
        field_3: { fieldType: 'RADIO', value: 'minor_revision' },
      };
      // debugger;
      const res = await request(app)
        .post(`/v1/journals/${journal.id}/forms/response/${response.id}/submit`)
        .set('authorization', `Bearer ${refereeUserAuthToken}`)
        .send({
          fieldResponses: formData,
        });

      expect(res.status).to.equal(200);
      const { submitted: submittedResponse } = res.body.data;
      // debugger;
      expect(submittedResponse.status).to.equal(FormResponseStatus.SUBMITTED);
      expect(submittedResponse.submittedAt).to.not.be.null;

      // Check if a review was created
      const review = await prisma.journalSubmissionReview.findFirst({
        where: { refereeAssignmentId: assignment.id },
      });
      expect(review).to.not.be.null;
    });

    it('should prevent submission if required fields are missing', async () => {
      const formData = {
        // Missing field_1 and field_3
        field_2: { fieldType: 'RATING', value: 4 },
      };
      // debugger;
      const res = await request(app)
        .post(`/v1/journals/${journal.id}/forms/response/${response.id}/submit`)
        .set('authorization', `Bearer ${refereeUserAuthToken}`)
        .send({
          fieldResponses: formData,
        });

      expect(res.status).to.equal(400);
      expect(res.body.message).to.include('Invalid inputs');
      const errors = res.body.errors;
      const firstField = errors['field_1'];
      expect(firstField).to.contain('Required');
    });
  });
});
