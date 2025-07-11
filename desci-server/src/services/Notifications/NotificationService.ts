import {
  NotificationType,
  Prisma,
  User,
  UserNotifications,
  Node,
  DoiStatus,
  NotificationCategory,
  Journal,
  EditorRole,
  JournalSubmission,
  JournalEditor,
  RefereeInvite,
} from '@prisma/client';
import _ from 'lodash';
import { z } from 'zod';

import { prisma } from '../../client.js';
import { CreateNotificationSchema } from '../../controllers/notifications/create.js';
import { GetNotificationsQuerySchema, PaginatedResponse } from '../../controllers/notifications/index.js';
import { logger as parentLogger } from '../../logger.js';
import { roleCopy } from '../../templates/emails/journals/InviteEditor.js';
import { ensureUuidEndsWithDot } from '../../utils.js';
import { attestationService } from '../Attestation.js';
import { getDpidFromNode, getDpidFromNodeUuid } from '../node.js';
import { PublishServices } from '../PublishServices.js';
import { emitWebsocketEvent, WebSocketEventType } from '../websocketService.js';

import {
  AttestationValidationPayload,
  CommentPayload,
  ContributorInvitePayload,
  DoiIssuanceStatusPayload,
  JournalEditorInvitePayload,
  JournalNotificationType,
  PublishPayload,
  RefereeInvitePayload,
  RefereeReassignedPayload,
  RefereeReviewReminderPayload,
  SubmissionAcceptedPayload,
  SubmissionAssignedToEditorPayload,
  SubmissionDeskRejectionPayload,
  SubmissionReassignedToEditorPayload,
  SubmissionOverdueEditorReminderPayload,
  MajorRevisionRequestedPayload,
  RefereeAcceptedPayload,
  RefereeDeclinedPayload,
  MinorRevisionRequestedPayload,
  RevisionSubmittedPayload,
  SubmissionFinalRejectionPayload,
} from './notificationPayloadTypes.js';

type GetNotificationsQuery = z.infer<typeof GetNotificationsQuerySchema>;
export type CreateNotificationData = z.infer<typeof CreateNotificationSchema>;

const logger = parentLogger.child({
  module: 'UserNotifications::NotificationService',
});

export type NotificationSettings = Partial<Record<NotificationType, boolean>>;

export type NotificationUpdateData = {
  dismissed?: boolean;
};

const getUserNotifications = async (
  userId: number,
  query: GetNotificationsQuery,
): Promise<PaginatedResponse<UserNotifications>> => {
  let { category } = query;
  if (!category) category = NotificationCategory.DESCI_PUBLISH; // Default if none provided, for backwards compatibility
  const { page, perPage, dismissed } = query;
  const skip = (page - 1) * perPage;
  const whereClause = {
    userId,
    ...(dismissed !== undefined && { dismissed }),
    category,
  };

  const [notifications, totalItems] = await Promise.all([
    prisma.userNotifications.findMany({
      where: whereClause,
      skip,
      take: perPage,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.userNotifications.count({ where: whereClause }),
  ]);

  const totalPages = Math.ceil(totalItems / perPage);

  return {
    data: notifications,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
    },
  };
};

const createUserNotification = async (
  data: CreateNotificationData,
  options?: { throwOnDisabled?: boolean; emittedFromClient?: boolean },
): Promise<UserNotifications | null> => {
  logger.info({ data }, 'Creating user notification');

  const settings = await getNotificationSettings(data.userId);

  if (!shouldSendNotification(settings, data.type)) {
    logger.warn({ userId: data.userId, type: data.type }, 'Notification creation blocked by user settings');
    if (options?.throwOnDisabled) throw new Error('Notification type is disabled for this user');
    return null;
  }

  if (data.nodeUuid) {
    // Validate node belongs to user
    const node = await prisma.node.findUnique({
      where: { uuid: data.nodeUuid },
      select: { ownerId: true },
    });

    if (!node) {
      logger.warn({ nodeUuid: data.nodeUuid }, 'Node not found');
      throw new Error('Node not found');
    }
    if (!!options?.emittedFromClient && node.ownerId !== data.userId) {
      logger.warn({ nodeUuid: data.nodeUuid, userId: data.userId }, 'Node does not belong to the user');
      throw new Error('Node does not belong to the user');
    }
  }

  if (!Object.values(NotificationType).includes(data.type as NotificationType)) {
    // Validates valid notification type
    logger.warn({ type: data.type }, 'Invalid notification type');
    throw new Error('Invalid notification type');
  }

  const notificationData: Prisma.UserNotificationsCreateInput = {
    user: { connect: { id: data.userId } },
    type: data.type as NotificationType,
    title: data.title,
    message: data.message,
    dismissed: false,
    node: data.nodeUuid ? { connect: { uuid: data.nodeUuid } } : undefined,
    payload: data.payload ? (data.payload as Prisma.JsonObject) : undefined,
    category: data.category ?? NotificationCategory.DESCI_PUBLISH,
  };

  const notification = await prisma.userNotifications.create({
    data: notificationData,
  });

  logger.info({ notificationId: notification.id }, 'User notification created successfully');

  // Emit websocket push notification
  emitWebsocketEvent(data.userId, { type: WebSocketEventType.NOTIFICATION, data: 'invalidate-cache' });
  incrementUnseenNotificationCount({ userId: data.userId });

  return notification;
};

const updateUserNotification = async (
  notificationId: number,
  userId: number,
  updateData: NotificationUpdateData,
): Promise<UserNotifications> => {
  logger.info({ notificationId, userId, updateData }, 'Updating user notification');

  const notification = await prisma.userNotifications.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    logger.warn({ notificationId }, 'Notification not found');
    throw new Error('Notification not found');
  }

  if (notification.userId !== userId) {
    logger.warn({ notificationId, userId }, 'Notification does not belong to the user');
    throw new Error('Notification does not belong to the user');
  }

  const updatedNotification = await prisma.userNotifications.update({
    where: { id: notificationId },
    data: updateData,
  });

  logger.info({ notificationId: updatedNotification.id }, 'User notification updated successfully');
  return updatedNotification;
};

const batchUpdateUserNotifications = async ({
  notificationIds,
  userId,
  updateData,
  all,
}: {
  notificationIds: number[];
  userId: number;
  updateData: NotificationUpdateData;
  all?: boolean;
}): Promise<number> => {
  logger.info({ notificationIds, userId, updateData }, 'Batch updating user notifications');

  const result = await prisma.userNotifications.updateMany({
    where: {
      ...(all ? {} : { id: { in: notificationIds } }),
      userId: userId,
    },
    data: updateData,
  });

  logger.info({ userId, count: result.count }, 'User notifications batch updated successfully');
  return result.count;
};

const updateNotificationSettings = async (
  userId: number,
  newSettings: NotificationSettings,
): Promise<Partial<Record<NotificationType, boolean>>> => {
  logger.info({ userId, newSettings }, 'Updating user notification settings');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationSettings: true },
  });

  const currentSettings = (user?.notificationSettings as NotificationSettings) || {};
  const mergedSettings = { ...currentSettings, ...newSettings };

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      notificationSettings: mergedSettings as Prisma.JsonObject,
    },
  });

  logger.info({ userId, mergedSettings }, 'User notification settings updated successfully');
  return mergedSettings;
};

/*
 ** A JSON object stored on the User model, if <NotificationType> is set to false, the user will not receive notifications of that type,
 ** otherwise, they will receive notifications of that type. Note: Undefined types will default to true.
 */
const getNotificationSettings = async (userId: number): Promise<NotificationSettings> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationSettings: true },
  });

  return (user?.notificationSettings as NotificationSettings) || {};
};

const shouldSendNotification = (settings: NotificationSettings, type: NotificationType): boolean => {
  return settings[type] !== false;
};

const getUnseenNotificationCount = async ({ userId, user }: { userId?: number; user?: User }) => {
  if (!userId && !user) {
    throw new Error('Missing userId or user');
  }
  if (!user || user.unseenNotificationCount === undefined) {
    const { unseenNotificationCount } = await prisma.user.findUnique({
      where: { id: userId ?? user.id },
      select: { unseenNotificationCount: true },
    });
    return unseenNotificationCount;
  }
  return user.unseenNotificationCount;
};

const incrementUnseenNotificationCount = async ({ userId }: { userId: number }) => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { unseenNotificationCount: { increment: 1 } },
    });
  } catch (err) {
    logger.error({ err }, 'Error');
  }
};

const resetUnseenNotificationCount = async ({ userId }: { userId: number }) => {
  await prisma.user.update({
    where: { id: userId },
    data: { unseenNotificationCount: 0 },
  });
};

const emitOnAnnotation = async (annotationId: number) => {
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    include: {
      author: true,
      node: {
        include: { owner: true },
      },
      attestation: {
        include: {
          node: {
            include: { owner: true },
          },
        },
      },
    },
  });

  if (!annotation) {
    logger.warn({ annotationId }, 'Annotation not found');
    return;
  }

  const annotationAuthor = annotation.author;
  const annotationAuthorName = annotationAuthor?.name || 'A user';
  const node = annotation.node || annotation.attestation?.node;
  const nodeOwner = node?.owner;

  if (!nodeOwner) {
    logger.warn({ annotationId }, 'Linked owner not found on annotation');
    return;
  }

  const dotlessUuid = node.uuid.replace(/\./g, '');
  const dpid = await getDpidFromNode(node as Node);

  const payload: CommentPayload = {
    type: NotificationType.COMMENTS,
    nodeUuid: dotlessUuid,
    nodeTitle: node.title,
    dpid,
    annotationId,
    commentAuthor: { name: annotationAuthorName, userId: annotationAuthor.id },
  };

  const notificationData: CreateNotificationData = {
    userId: nodeOwner.id,
    type: NotificationType.COMMENTS,
    title: `${annotationAuthorName} commented on your research object`,
    message: `Your research object titled ${node.title}, has received a new comment.`, // TODO:: Ideally deserialize some of the message body from the annotation and show a truncated snippet
    nodeUuid: node.uuid,
    category: NotificationCategory.DESCI_PUBLISH,
    payload,
  };

  await createUserNotification(notificationData);
};
//
const emitOnPublish = async (node: Node, user: User, dpid: string, publishStatusId: number) => {
  try {
    const dotlessUuid = node.uuid.replace(/\./g, '');
    const payload: PublishPayload = {
      type: NotificationType.PUBLISH,
      nodeUuid: dotlessUuid,
      dpid,
      nodeTitle: node.title,
    };
    const notificationData: CreateNotificationData = {
      userId: user.id,
      type: NotificationType.PUBLISH,
      title: `Your research object has been published!`,
      message: `Your research object titled "${node.title}" has been published and is now available for public access.`,
      nodeUuid: node.uuid,
      payload,
      category: NotificationCategory.DESCI_PUBLISH,
    };

    await createUserNotification(notificationData);
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        fireNotifications: true,
      },
    });
  } catch (e) {
    logger.error({ fn: 'emitNotificationOnPublish', error: e }, 'Error emitting notification on publish');
    await PublishServices.updatePublishStatusEntry({
      publishStatusId,
      data: {
        fireNotifications: false,
      },
    });
  }
};

const emitOnContributorInvite = async ({
  node,
  nodeOwner,
  targetUserId,
  privShareCode,
  contributorId,
}: {
  node: Node;
  nodeOwner: User;
  targetUserId: number;
  privShareCode: string;
  contributorId;
}) => {
  const dotlessUuid = node.uuid.replace(/\./g, '');
  const nodeOwnerName = nodeOwner.name || 'A user';
  const dpid = await getDpidFromNode(node);

  const payload: ContributorInvitePayload = {
    type: NotificationType.CONTRIBUTOR_INVITE,
    nodeUuid: dotlessUuid,
    nodeTitle: node.title,
    dpid,
    shareCode: privShareCode,
    contributorId,
    inviterId: nodeOwner.id,
    inviterName: nodeOwner.name,
  };

  const notificationData: CreateNotificationData = {
    userId: targetUserId,
    type: NotificationType.CONTRIBUTOR_INVITE,
    title: `${nodeOwnerName} has added you as a contributor to their research`,
    message: `Confirm your contribution status for the research object titled "${node.title}".`,
    nodeUuid: node.uuid,
    payload,
    category: NotificationCategory.DESCI_PUBLISH,
  };

  await createUserNotification(notificationData);
};
const emitOnAttestationValidation = async ({ node, user, claimId }: { node: Node; user: User; claimId: number }) => {
  const dotlessUuid = node.uuid.replace(/\./g, '');
  const claim = await attestationService.findClaimById(claimId);
  const versionedAttestation = await attestationService.getAttestationVersion(claim.attestationVersionId, claimId);
  const dpid = await getDpidFromNode(node);
  const attestationName = versionedAttestation.name;

  const payload: AttestationValidationPayload = {
    type: NotificationType.ATTESTATION_VALIDATION,
    nodeUuid: dotlessUuid,
    nodeTitle: node.title,
    dpid,
    claimId,
    attestationId: claim.attestationId,
    attestationVersionId: claim.attestationVersionId,
    attestationName,
  };

  const notificationData: CreateNotificationData = {
    userId: user.id,
    type: NotificationType.ATTESTATION_VALIDATION,
    title: `The "${attestationName}" attestation has been validated for DPID ${dpid}`,
    message: `An attestation maintainer has validated your attestation claim on your research object titled "${node.title}".`,
    nodeUuid: node.uuid,
    payload,
    category: NotificationCategory.DESCI_PUBLISH,
  };

  await createUserNotification(notificationData);
};

const emitOnDoiIssuance = async ({ nodeUuid, doi, status }: { nodeUuid: string; doi: string; status: DoiStatus }) => {
  const dotlessUuid = nodeUuid.replace(/\./g, '');
  const node = await prisma.node.findUnique({
    where: { uuid: ensureUuidEndsWithDot(nodeUuid) },
    select: { ownerId: true, title: true, dpidAlias: true, manifestUrl: true },
  });
  const dpid = await getDpidFromNode(node as Node);

  const payload: DoiIssuanceStatusPayload = {
    type: NotificationType.DOI_ISSUANCE_STATUS,
    nodeUuid: dotlessUuid,
    nodeTitle: node.title,
    dpid,
    issuanceStatus: status,
    doi,
  };

  const notificationData: CreateNotificationData = {
    userId: node.ownerId,
    type: NotificationType.DOI_ISSUANCE_STATUS,
    title: `A DOI has been issued for your research object with DPID ${dpid}!`,
    message: `A DOI has been successfuly assigned to your research object with DPID ${dpid}. The DOI is ${doi}.`,
    nodeUuid,
    payload,
    category: NotificationCategory.DESCI_PUBLISH,
  };

  await createUserNotification(notificationData);
};

const emitOnJournalEditorInvite = async ({
  journal,
  editor,
  inviter,
  role,
}: {
  journal: Pick<Journal, 'id' | 'name' | 'description' | 'iconCid'>;
  editor: User;
  inviter: User;
  role: EditorRole;
}) => {
  const payload: JournalEditorInvitePayload = {
    type: JournalNotificationType.JOURNAL_EDITOR_INVITE,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    role,
    inviterName: inviter.name,
    inviterUserId: inviter.id,
  };

  const notificationData: CreateNotificationData = {
    userId: editor.id,
    type: NotificationType.JOURNAL_EDITOR_INVITE,
    title: `You've received a journal editor invite!`,
    message: `You have been invited to join the ${journal.name} journal as ${roleCopy[role]}.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnJournalSubmissionAssignedToEditor = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  managerEditor,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  managerEditor: JournalEditor;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });
  const managerUser = await prisma.user.findUnique({
    where: { id: managerEditor.userId },
  });

  const payload: SubmissionAssignedToEditorPayload = {
    type: JournalNotificationType.SUBMISSION_ASSIGNED_TO_EDITOR,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    managerName: managerUser?.name,
    managerUserId: managerUser?.id,
    managerEditorId: managerEditor.id,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
    journalEditorId: editor.id,
  };

  const notificationData: CreateNotificationData = {
    userId: editor.userId,
    type: NotificationType.SUBMISSION_ASSIGNED_TO_EDITOR,
    title: `[${journal.name}] You've been assigned as the editor for a submission!`,
    message: `You have been assigned as the editor for a submission titled "${submissionTitle}" for the ${journal.name} journal.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnJournalSubmissionReassignedToEditor = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  managerEditor,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  managerEditor: JournalEditor;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });
  const managerUser = await prisma.user.findUnique({
    where: { id: managerEditor.userId },
  });

  const payload: SubmissionReassignedToEditorPayload = {
    type: JournalNotificationType.SUBMISSION_REASSIGNED_TO_EDITOR,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    managerName: managerUser?.name,
    managerUserId: managerUser?.id,
    managerEditorId: managerEditor.id,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
    journalEditorId: editor.id,
  };

  const notificationData: CreateNotificationData = {
    userId: editor.userId,
    type: NotificationType.SUBMISSION_REASSIGNED_TO_EDITOR,
    title: `[${journal.name}] You've been reassigned as the editor for a submission!`,
    message: `You have been reassigned as the editor for a submission titled "${submissionTitle}" for the ${journal.name} journal.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnRefereeInvitation = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  referee,
  inviteToken,
  dueDateHrs,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  referee: Pick<User, 'id' | 'name' | 'email'>;
  inviteToken: string;
  dueDateHrs: number;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });

  const payload: RefereeInvitePayload = {
    type: JournalNotificationType.REFEREE_INVITE,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
    refereeName: referee.name,
    refereeUserId: referee.id,
    dueDateHrs,
    inviteToken,
  };

  const notificationData: CreateNotificationData = {
    userId: referee.id,
    type: NotificationType.REFEREE_INVITE,
    title: `${journal.name} has invited you to review a submission!`,
    message: `You have been invited as a referee to review the submission titled "${submissionTitle}" for the ${journal.name} journal.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnRefereeReassignmentInvitation = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  referee,
  dueDate,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  referee: User;
  dueDate: Date;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });

  const payload: RefereeReassignedPayload = {
    type: JournalNotificationType.REFEREE_REASSIGNED,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
    refereeName: referee.name,
    refereeUserId: referee.id,
    dueDate: dueDate,
  };

  const notificationData: CreateNotificationData = {
    userId: referee.id,
    type: NotificationType.REFEREE_REASSIGNED,
    title: `${journal.name} has invited you as a referee for a submission!`,
    message: `You have been reassigned as a referee to review the submission titled "${submissionTitle}" for the ${journal.name} journal. Accept or deny the request as soon as possible.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnRefereeAcceptance = async ({
  journal,
  submission,
  submissionTitle,
  referee,
  dueDate,
  refereeInvite,
}: {
  journal: Journal;
  submission: JournalSubmission;
  submissionTitle: string;
  referee: User;
  dueDate: Date;
  refereeInvite: RefereeInvite;
}) => {
  if (!submission.assignedEditorId) {
    logger.info(
      { fn: 'emitOnRefereeAcceptance', submissionId: submission.id },
      'Skipping notification - No editor assigned to submission',
    );
    return;
  }

  const payload: RefereeAcceptedPayload = {
    type: JournalNotificationType.REFEREE_ACCEPTED,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    refereeName: referee.name,
    refereeUserId: referee.id,
    dueDate: dueDate,
    inviteId: refereeInvite.id,
  };

  const notificationData: CreateNotificationData = {
    userId: submission.assignedEditorId,
    type: NotificationType.REFEREE_ACCEPTED,
    title: `[${journal.name}] ${referee.name} has accepted the invitation to review a submission!`,
    message: `${referee.name} has accepted the invitation to review the submission titled "${submissionTitle}" for the ${journal.name} journal.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnRefereeDecline = async ({
  journal,
  submission,
  submissionTitle,
  referee,
  refereeInvite,
}: {
  journal: Journal;
  submission: JournalSubmission;
  submissionTitle: string;
  referee?: User;
  refereeInvite: RefereeInvite;
}) => {
  if (!submission.assignedEditorId) {
    logger.info(
      { fn: 'emitOnRefereeDecline', submissionId: submission.id },
      'Skipping notification - No editor assigned to submission',
    );
    return;
  }

  // Referee isn't guaranteed to have a user account.
  const refereeName = referee?.name || refereeInvite.email;

  const payload: RefereeDeclinedPayload = {
    type: JournalNotificationType.REFEREE_DECLINED,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    refereeName: referee.name,
    refereeUserId: referee.id,
    refereeEmail: referee.email,
    inviteId: refereeInvite.id,
  };

  const notificationData: CreateNotificationData = {
    userId: submission.assignedEditorId,
    type: NotificationType.REFEREE_DECLINED,
    title: `[${journal.name}] ${refereeName} has declined the invitation to review a submission!`,
    message: `${refereeName} has declined the invitation to review the submission titled "${submissionTitle}" for the ${journal.name} journal. Please reassign a new referee.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnRefereeReviewReminder = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  referee,
  dueDate,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  referee: User;
  dueDate: Date;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });

  const payload: RefereeReviewReminderPayload = {
    type: JournalNotificationType.REFEREE_REVIEW_REMINDER,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    refereeName: referee.name,
    refereeUserId: referee.id,
    dueDate: dueDate,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
  };

  const notificationData: CreateNotificationData = {
    userId: editorUser.id,
    type: NotificationType.REFEREE_REVIEW_REMINDER,
    title: `[${journal.name}] You have a submission awaiting your review and nearing the due date!`,
    message: `You have a submission titled "${submissionTitle}" for the ${journal.name} journal that is awaiting your review and nearing the due date. Please review it as soon as possible.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnMajorRevisionRequest = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  author,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  author: User;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });

  const payload: MajorRevisionRequestedPayload = {
    type: JournalNotificationType.MAJOR_REVISION_REQUESTED,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    authorName: author.name,
    authorUserId: author.id,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
  };

  const notificationData: CreateNotificationData = {
    userId: author.id,
    type: NotificationType.MAJOR_REVISION_REQUESTED,
    title: `[${journal.name}] ${editorUser?.name} has requested a major revision for your submission!`,
    message: `${editorUser?.name} has requested a major revision for your submission titled "${submissionTitle}" in the ${journal.name} journal.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnMinorRevisionRequest = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  author,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  author: User;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });

  const payload: MinorRevisionRequestedPayload = {
    type: JournalNotificationType.MINOR_REVISION_REQUESTED,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    authorName: author.name,
    authorUserId: author.id,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
  };

  const notificationData: CreateNotificationData = {
    userId: author.id,
    type: NotificationType.MINOR_REVISION_REQUESTED,
    title: `[${journal.name}] ${editorUser?.name} has requested a minor revision for your submission!`,
    message: `${editorUser?.name} has requested a minor revision for your submission titled "${submissionTitle}" in the ${journal.name} journal.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnRevisionSubmittedToEditor = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  author,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  author: User;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });

  const payload: RevisionSubmittedPayload = {
    type: JournalNotificationType.REVISION_SUBMITTED,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    authorName: author.name,
    authorUserId: author.id,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
  };

  const notificationData: CreateNotificationData = {
    userId: editorUser.id,
    type: NotificationType.REVISION_SUBMITTED,
    title: `[${journal.name}] ${author.name} has submitted a revision for their submission!`,
    message: `${author.name} has submitted a revision for their submission titled "${submissionTitle}" in the ${journal.name} journal.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnSubmissionDeskRejection = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  author,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  author: User;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });

  const payload: SubmissionDeskRejectionPayload = {
    type: JournalNotificationType.SUBMISSION_DESK_REJECTION,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, [
      'id',
      'version',
      'dpid',
      'assignedEditorId',
      'submittedAt',
      'status',
      'rejectedAt',
    ]),
    submissionTitle,
    authorName: author.name,
    authorUserId: author.id,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
  };

  const notificationData: CreateNotificationData = {
    userId: author.id,
    type: NotificationType.SUBMISSION_DESK_REJECTION,
    title: `[${journal.name}] Your submission has been desk rejected.`,
    message: `Your submission titled "${submissionTitle}" in the ${journal.name} journal has been desk rejected.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnSubmissionFinalRejection = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  author,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  author: User;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });

  const payload: SubmissionFinalRejectionPayload = {
    type: JournalNotificationType.SUBMISSION_FINAL_REJECTION,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, [
      'id',
      'version',
      'dpid',
      'assignedEditorId',
      'submittedAt',
      'status',
      'rejectedAt',
    ]),
    submissionTitle,
    authorName: author.name,
    authorUserId: author.id,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
  };

  const notificationData: CreateNotificationData = {
    userId: author.id,
    type: NotificationType.SUBMISSION_FINAL_REJECTION,
    title: `[${journal.name}] Your submission has been rejected.`,
    message: `Your submission titled "${submissionTitle}" in the ${journal.name} journal has been rejected.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnSubmissionAcceptance = async ({
  journal,
  submission,
  submissionTitle,
  author,
}: {
  journal: Journal;
  submission: JournalSubmission;
  submissionTitle: string;
  author: User;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: submission.assignedEditorId },
  });

  const payload: SubmissionAcceptedPayload = {
    type: JournalNotificationType.SUBMISSION_ACCEPTED,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, [
      'id',
      'version',
      'dpid',
      'assignedEditorId',
      'submittedAt',
      'status',
      'acceptedAt',
    ]),
    submissionTitle,
    authorName: author.name,
    authorUserId: author.id,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
  };

  const notificationData: CreateNotificationData = {
    userId: author.id,
    type: NotificationType.SUBMISSION_ACCEPTED,
    title: `[${journal.name}] Congratulations! Your submission has been accepted.`,
    message: `Your submission titled "${submissionTitle}" in the ${journal.name} journal has been accepted.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

const emitOnSubmissionOverdueEditorReminder = async ({
  journal,
  editor,
  submission,
  submissionTitle,
  dueDate,
}: {
  journal: Journal;
  editor: JournalEditor;
  submission: JournalSubmission;
  submissionTitle: string;
  dueDate: Date;
}) => {
  const editorUser = await prisma.user.findUnique({
    where: { id: editor.userId },
  });

  const payload: SubmissionOverdueEditorReminderPayload = {
    type: JournalNotificationType.SUBMISSION_OVERDUE_EDITOR_REMINDER,
    journal: _.pick(journal, ['id', 'name', 'description', 'iconCid']),
    submission: _.pick(submission, ['id', 'version', 'dpid', 'assignedEditorId', 'submittedAt', 'status']),
    submissionTitle,
    editorName: editorUser?.name,
    editorUserId: editorUser?.id,
    dueDate: dueDate,
  };

  const notificationData: CreateNotificationData = {
    userId: editor.userId,
    type: NotificationType.SUBMISSION_OVERDUE_EDITOR_REMINDER,
    title: `[${journal.name}] The submission is overdue.`,
    message: `The submission titled "${submissionTitle}", that you are assigned to as the editor for the ${journal.name} journal, is overdue. Please review it as soon as possible.`,
    payload,
    category: NotificationCategory.DESCI_JOURNALS,
  };

  await createUserNotification(notificationData);
};

export const NotificationService = {
  getUserNotifications,
  createUserNotification,
  updateUserNotification,
  batchUpdateUserNotifications,
  updateNotificationSettings,
  getNotificationSettings,
  getUnseenNotificationCount,
  resetUnseenNotificationCount,
  emitOnAnnotation,
  emitOnPublish,
  emitOnContributorInvite,
  emitOnAttestationValidation,
  emitOnDoiIssuance,
  emitOnJournalEditorInvite,
  emitOnJournalSubmissionAssignedToEditor,
  emitOnJournalSubmissionReassignedToEditor,
  emitOnRefereeInvitation,
  emitOnRefereeReassignmentInvitation,
  emitOnRefereeAcceptance,
  emitOnRefereeDecline,
  emitOnRefereeReviewReminder,
  emitOnMajorRevisionRequest,
  emitOnMinorRevisionRequest,
  emitOnRevisionSubmittedToEditor,
  emitOnSubmissionDeskRejection,
  emitOnSubmissionFinalRejection,
  emitOnSubmissionAcceptance,
  emitOnSubmissionOverdueEditorReminder,
};
