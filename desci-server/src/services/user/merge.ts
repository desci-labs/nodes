import {
  ActionType,
  BookmarkType,
  NotificationType,
  Prisma,
  PrismaClient,
  User,
  UserNotifications,
} from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { DataMigrationService } from '../DataMigration/DataMigrationService.js';
import { saveInteractionWithoutReq } from '../interactionLog.js';
import { CommentPayload, ContributorInvitePayload } from '../NotificationService.js';

const logger = parentLogger.child({
  module: 'UserServices::Merge',
});

/**
 * Merges a guest account into an existing user, if a user accidentally created work in a guest session.
 *
 * Relevant Tables:
 *
 ** User
 ** Node
 ** NodeVersion
 ** InteractionLog
 ** AuthToken
 ** Wallet // Probably doesn't apply, guests can't publish in the UI.
 ** PublishedWallet
 ** UserIdentity
 ** DataReference - Expected 0
 ** GuestDataReference
 ** CidPruneList
 ** PrivateShare - (Auto)
 ** Bookmarked Node
 ** NodeCover
 ** NodeThumbnails - (Auto)
 ** NodeContribution - Self contributions need to be retargetted to the existing user.
 ** UserOrganizations
 ** DraftNodeTree - (Auto)
 ** CommunityMember - Shouldn't be possible to merge as a guest.
 ** NodeAttestation
 ** DeferredEmails
 ** Annotation - Shouldn't be possible (this is leaving comments I think?)
 ** NodeAttestationReaction - Shouldn't be possible.
 ** NodeAttestationVerification - Shouldn't be possible.
 ** OrcidPutCodes
 ** DoiRecord
 ** UserNotifications
 ** DataMigration
 */
async function mergeGuestIntoExistingUser(guestId: number, userId: number) {
  try {
    const guest = await prisma.user.findUnique({
      where: {
        id: guestId,
      },
    });

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      throw new Error('Existing user not found');
    }
    if (!guest?.isGuest) {
      throw new Error('Guest user is not a guest');
    }

    logger.info({ fn: 'mergeGuestIntoExistingUser', guestId, userId }, 'Merging guest into existing user');
    await saveInteractionWithoutReq({
      action: ActionType.MERGE_GUEST_INTO_EXISTING_USER_ATTEMPT,
      data: { guestId, existingUserId: existingUser.id },
      userId: existingUser.id,
    });

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: existingUser.id,
        },
        data: {
          unseenNotificationCount: guest.unseenNotificationCount + existingUser.unseenNotificationCount,
          mergedIntoAt: {
            push: new Date(),
          },
        },
      });

      // Change node ownership
      await tx.node.updateMany({
        where: {
          ownerId: guest.id,
        },
        data: {
          ownerId: existingUser.id,
        },
      });

      // Update interaction logs
      await tx.interactionLog.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update AuthToken table entries
      await tx.authToken.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update Wallet table entries - Shouldn't be any for a guest, but just in case.
      await tx.wallet.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update PublishedWallet table entries - Shouldn't be any for a guest, but just in case.
      await tx.publishedWallet.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update UserIdentity table entries
      await tx.userIdentity.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update DataReferences - Shouldn't be any for a guest, but just in case.
      await tx.dataReference.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update GuestDataReferences.
      await tx.guestDataReference.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update CidPruneList entries
      await tx.cidPruneList.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update Bookmarked Nodes - Deduplicates.
      await mergeBookmarks(tx, guest, existingUser);

      // Update NodeContributions
      await tx.nodeContribution.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update UserOrganizations table entries - Probably doesn't apply, just to be sure.
      await mergeUserOrganizations(tx, guest, existingUser);

      // Remove CommunityMemberships by the Guest, shouldn't be possible.
      await tx.communityMember.deleteMany({
        where: {
          userId: guest.id,
        },
      });

      // Update NodeAttestation entries
      await tx.nodeAttestation.updateMany({
        where: {
          claimedById: guest.id,
        },
        data: {
          claimedById: existingUser.id,
        },
      });

      // Update DeferredEmails
      await tx.deferredEmails.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update Annotations
      await tx.annotation.updateMany({
        where: {
          authorId: guest.id,
        },
        data: {
          authorId: existingUser.id,
        },
      });

      // Update NodeAttestationReactions
      await tx.nodeAttestationReaction.updateMany({
        where: {
          authorId: guest.id,
        },
        data: {
          authorId: existingUser.id,
        },
      });

      // Update NodeAttestationVerifications
      await tx.nodeAttestationVerification.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update OrcidPutCodes
      await tx.orcidPutCodes.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Update UserNotifications
      await mergeUserNotifications(tx, guest, existingUser);

      // Update DataMigration entries
      await tx.dataMigration.updateMany({
        where: {
          userId: guest.id,
        },
        data: {
          userId: existingUser.id,
        },
      });

      // Delete guest user
      await tx.user.delete({
        where: {
          id: guest.id,
        },
      });
    });

    await saveInteractionWithoutReq({
      action: ActionType.MERGE_GUEST_INTO_EXISTING_USER_SUCCESS,
      data: { guestId, existingUserId: existingUser.id },
      userId: existingUser.id,
    });
    logger.info({ fn: 'mergeGuestIntoExistingUser', guestId, userId }, 'Completed db merging guest into existing user');

    return { success: true };
  } catch (e) {
    logger.error({ error: e }, 'Error merging guest into existing user');
    await saveInteractionWithoutReq({
      action: ActionType.MERGE_GUEST_INTO_EXISTING_USER_FAIL,
      data: { guestId, existingUserId: userId, error: e },
      userId: userId,
    });
    return { success: false, error: e };
  }
}

type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Merges bookmarks from a guest user into an existing user.
 ** Takes care of deduplicating the bookmarks between the 2 users.
 * We use app logic to prevent duplicate bookmarks, we can't rely on the db to do this
 * as part of the unique constraint dependency array are optional fields.
 */
async function mergeBookmarks(tx: PrismaTransactionClient, guest: User, existingUser: User) {
  // Fetch guest bookmarks
  const guestBookmarks = await tx.bookmarkedNode.findMany({
    where: { userId: guest.id },
  });

  if (guestBookmarks.length === 0) {
    // No bookmarks to merge, exit early
    return;
  }

  // Fetch existing user bookmarks for comparison
  const existingUserBookmarks = await tx.bookmarkedNode.findMany({
    where: { userId: existingUser.id },
    select: {
      type: true,
      nodeUuid: true,
      doi: true,
      oaWorkId: true,
    },
  });

  // Create sets for efficient lookup of existing bookmarks
  const existingNodeBookmarks = new Set(
    existingUserBookmarks.filter((b) => b.type === BookmarkType.NODE && b.nodeUuid).map((b) => b.nodeUuid!),
  );
  const existingDoiBookmarks = new Set(
    existingUserBookmarks.filter((b) => b.type === BookmarkType.DOI && b.doi).map((b) => b.doi!),
  );
  const existingOaBookmarks = new Set(
    existingUserBookmarks.filter((b) => b.type === BookmarkType.OA && b.oaWorkId).map((b) => b.oaWorkId!),
  );

  const bookmarksToDelete: number[] = [];
  const bookmarksToUpdate: number[] = [];

  for (const guestBookmark of guestBookmarks) {
    let isDuplicate = false;
    switch (guestBookmark.type) {
      case BookmarkType.NODE:
        if (guestBookmark.nodeUuid && existingNodeBookmarks.has(guestBookmark.nodeUuid)) {
          isDuplicate = true;
        }
        break;
      case BookmarkType.DOI:
        if (guestBookmark.doi && existingDoiBookmarks.has(guestBookmark.doi)) {
          isDuplicate = true;
        }
        break;
      case BookmarkType.OA:
        if (guestBookmark.oaWorkId && existingOaBookmarks.has(guestBookmark.oaWorkId)) {
          isDuplicate = true;
        }
        break;
    }

    if (isDuplicate) {
      bookmarksToDelete.push(guestBookmark.id);
    } else {
      bookmarksToUpdate.push(guestBookmark.id);
    }
  }

  // Perform deletions and updates

  if (bookmarksToDelete.length > 0) {
    await tx.bookmarkedNode.deleteMany({
      where: {
        id: { in: bookmarksToDelete },
      },
    });
  }

  if (bookmarksToUpdate.length > 0) {
    await tx.bookmarkedNode.updateMany({
      where: {
        id: { in: bookmarksToUpdate },
      },
      data: {
        userId: existingUser.id,
      },
    });
  }
}

/**
 * Merges organizations from a guest user into an existing user. Handles deduplication.
 */
async function mergeUserOrganizations(tx: PrismaTransactionClient, guest: User, existingUser: User) {
  const guestOrgs = await tx.userOrganizations.findMany({
    where: { userId: guest.id },
    select: { organizationId: true },
  });

  if (guestOrgs.length === 0) {
    return; // Nothing to merge
  }

  const existingUserOrgIds = await tx.userOrganizations.findMany({
    where: { userId: existingUser.id },
    select: { organizationId: true },
  });

  const existingOrgIdSet = new Set(existingUserOrgIds.map((uo) => uo.organizationId));

  const orgsToDelete: string[] = [];
  const orgsToUpdate: string[] = [];

  for (const guestOrg of guestOrgs) {
    if (existingOrgIdSet.has(guestOrg.organizationId)) {
      // Existing user already in this org, mark guest's entry for deletion
      orgsToDelete.push(guestOrg.organizationId);
    } else {
      // Existing user NOT in this org, mark guest's entry for update
      orgsToUpdate.push(guestOrg.organizationId);
    }
  }

  if (orgsToDelete.length > 0) {
    await tx.userOrganizations.deleteMany({
      where: {
        userId: guest.id,
        organizationId: { in: orgsToDelete },
      },
    });
  }

  if (orgsToUpdate.length > 0) {
    await tx.userOrganizations.updateMany({
      where: {
        userId: guest.id,
        organizationId: { in: orgsToUpdate },
      },
      data: {
        userId: existingUser.id,
      },
    });
  }
}

/**
 * Merges notifications from a guest user into an existing user.
 * Handles payload updates where relevant.
 */
async function mergeUserNotifications(tx: PrismaTransactionClient, guest: User, existingUser: User) {
  const guestNotifications = await tx.userNotifications.findMany({
    where: { userId: guest.id },
  });

  if (guestNotifications.length === 0) {
    logger.info({ guestId: guest.id }, 'No notifications found for guest user to merge.');
    return; // Nothing to merge
  }

  logger.info(
    { guestId: guest.id, existingUserId: existingUser.id, count: guestNotifications.length },
    'Merging notifications...',
  );

  // We need to update notifications one by one because payloads might need individual modification
  const updatePromises: Prisma.PrismaPromise<UserNotifications>[] = [];

  for (const notification of guestNotifications) {
    let updatedPayload = notification.payload as Prisma.JsonObject | null; // Start with existing payload

    // Check and update payload if necessary
    if (updatedPayload && typeof updatedPayload === 'object') {
      try {
        // Explicitly check the type field if it exists
        const type = updatedPayload.type as NotificationType;

        if (type === NotificationType.COMMENTS) {
          const commentPayload = updatedPayload as CommentPayload;
          if (commentPayload?.commentAuthor?.userId === guest.id) {
            commentPayload.commentAuthor.userId = existingUser.id;
            commentPayload.commentAuthor.name = existingUser.name || 'User';
            updatedPayload = commentPayload;
          }
        } else if (type === NotificationType.CONTRIBUTOR_INVITE) {
          const invitePayload = updatedPayload as ContributorInvitePayload;
          if (invitePayload?.inviterId === guest.id) {
            invitePayload.inviterId = existingUser.id;
            invitePayload.inviterName = existingUser.name || 'User';
            updatedPayload = invitePayload;
          }
        }
      } catch (error) {
        logger.error(
          { error, notificationId: notification.id, payload: notification.payload },
          'Failed to process notification payload during merge',
        );
        updatedPayload = notification.payload as Prisma.JsonObject | null; // Reset to original on error
      }
    }

    updatePromises.push(
      tx.userNotifications.update({
        where: { id: notification.id },
        data: {
          userId: existingUser.id,
          payload: updatedPayload,
        },
      }),
    );
  }

  await Promise.all(updatePromises);

  logger.info(
    { guestId: guest.id, existingUserId: existingUser.id, count: guestNotifications.length },
    'Finished merging notifications.',
  );
}

/**
 * Handles merging a guest user into an existing user authed via ORCID.
 ** Unable to use standard convertGuestOrcid flow, to stay consistent with
 * the existing ORCID flow.
 */
async function handleMergeExistingUserOrcid(existingUser: User, guest: User) {
  logger.info(
    { fn: 'handleMergeExistingUserOrcid', existingUserId: existingUser.id, guestId: guest.id },
    '[ExistingOrcidGuestConversion] Merging guest into existing ORCID user',
  );
  debugger;
  const mergeRes = await MergeUserService.mergeGuestIntoExistingUser(guest.id, existingUser.id);
  if (!mergeRes.success) {
    logger.error(
      { fn: 'handleMergeExistingUserOrcid', existingUserId: existingUser.id, guestId: guest.id, error: mergeRes.error },
      '[ExistingOrcidGuestConversion] Error merging guest into existing user',
    );
    return { success: false, error: mergeRes.error };
  }

  await saveInteractionWithoutReq({
    action: ActionType.GUEST_USER_CONVERSION,
    data: { userId: existingUser.id, conversionType: 'orcid', isExistingUser: true },
    userId: existingUser.id,
    submitToMixpanel: true,
  });

  await DataMigrationService.createGuestToPrivateMigrationJob(existingUser.id);
  logger.info(
    { fn: 'handleMergeExistingUserOrcid', existingUserId: existingUser.id, guestId: guest.id },
    '[ExistingOrcidGuestConversion] Merge complete',
  );
  return { success: true };
}

export const MergeUserService = {
  mergeGuestIntoExistingUser,
  handleMergeExistingUserOrcid,
};
