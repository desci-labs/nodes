import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({
  module: 'UserServices::Merge',
});

/**
 * Merges a guest account into an existing user, if a user accidentally created work in a guest session.
 * 
 * Relevant Tables
 * 
 * Update:
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
** 

* Delete:
** MagicLink


 */
async function mergeGuestIntoExistingUser(guestId: number, userId: number) {
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
  if (existingUser) {
    throw new Error('Existing user is a guest');
  }
}

export const MergeUserService = {
  mergeGuestIntoExistingUser,
};
