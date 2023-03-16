-- DropForeignKey
ALTER TABLE "AuthToken" DROP CONSTRAINT "AuthToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "AuthorInvite" DROP CONSTRAINT "AuthorInvite_nodeId_fkey";

-- DropForeignKey
ALTER TABLE "AuthorInvite" DROP CONSTRAINT "AuthorInvite_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "AuthorInvite" DROP CONSTRAINT "AuthorInvite_senderId_fkey";

-- DropForeignKey
ALTER TABLE "Invite" DROP CONSTRAINT "Invite_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "Invite" DROP CONSTRAINT "Invite_senderId_fkey";

-- DropForeignKey
ALTER TABLE "Node" DROP CONSTRAINT "Node_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "NodeAuthor" DROP CONSTRAINT "NodeAuthor_nodeId_fkey";

-- DropForeignKey
ALTER TABLE "NodeAuthor" DROP CONSTRAINT "NodeAuthor_userId_fkey";

-- DropForeignKey
ALTER TABLE "NodeVote" DROP CONSTRAINT "NodeVote_nodeId_fkey";

-- DropForeignKey
ALTER TABLE "NodeVote" DROP CONSTRAINT "NodeVote_userId_fkey";

-- DropForeignKey
ALTER TABLE "OauthAccessGrant" DROP CONSTRAINT "OauthAccessGrant_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "OauthAccessGrant" DROP CONSTRAINT "OauthAccessGrant_userId_fkey";

-- DropForeignKey
ALTER TABLE "OauthAccessToken" DROP CONSTRAINT "OauthAccessToken_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "OauthAccessToken" DROP CONSTRAINT "OauthAccessToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserIdentity" DROP CONSTRAINT "UserIdentity_userId_fkey";

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorInvite" ADD CONSTRAINT "AuthorInvite_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorInvite" ADD CONSTRAINT "AuthorInvite_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorInvite" ADD CONSTRAINT "AuthorInvite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAuthor" ADD CONSTRAINT "NodeAuthor_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeAuthor" ADD CONSTRAINT "NodeAuthor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeVote" ADD CONSTRAINT "NodeVote_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeVote" ADD CONSTRAINT "NodeVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "OauthApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessGrant" ADD CONSTRAINT "OauthAccessGrant_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "OauthApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessGrant" ADD CONSTRAINT "OauthAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "AuthorInvite.email_unique" RENAME TO "AuthorInvite_email_key";

-- RenameIndex
ALTER INDEX "AuthorInvite.phoneNumber_unique" RENAME TO "AuthorInvite_phoneNumber_key";

-- RenameIndex
ALTER INDEX "ChainTransaction.nodeVoteId_unique" RENAME TO "ChainTransaction_nodeVoteId_key";

-- RenameIndex
ALTER INDEX "Node.ownerId_index" RENAME TO "Node_ownerId_idx";

-- RenameIndex
ALTER INDEX "Node.uuid_index" RENAME TO "Node_uuid_idx";

-- RenameIndex
ALTER INDEX "OauthAccessGrant.applicationId_index" RENAME TO "OauthAccessGrant_applicationId_idx";

-- RenameIndex
ALTER INDEX "OauthAccessGrant.token_unique" RENAME TO "OauthAccessGrant_token_key";

-- RenameIndex
ALTER INDEX "OauthAccessGrant.userId_index" RENAME TO "OauthAccessGrant_userId_idx";

-- RenameIndex
ALTER INDEX "OauthAccessToken.applicationId_index" RENAME TO "OauthAccessToken_applicationId_idx";

-- RenameIndex
ALTER INDEX "OauthAccessToken.refreshToken_unique" RENAME TO "OauthAccessToken_refreshToken_key";

-- RenameIndex
ALTER INDEX "OauthAccessToken.token_unique" RENAME TO "OauthAccessToken_token_key";

-- RenameIndex
ALTER INDEX "OauthAccessToken.userId_index" RENAME TO "OauthAccessToken_userId_idx";

-- RenameIndex
ALTER INDEX "OauthApplication.clientId_unique" RENAME TO "OauthApplication_clientId_key";

-- RenameIndex
ALTER INDEX "Session.sid_unique" RENAME TO "Session_sid_key";

-- RenameIndex
ALTER INDEX "User.email_unique" RENAME TO "User_email_key";

-- RenameIndex
ALTER INDEX "User.orcid_index" RENAME TO "User_orcid_idx";

-- RenameIndex
ALTER INDEX "User.orcid_unique" RENAME TO "User_orcid_key";

-- RenameIndex
ALTER INDEX "User.phoneNumber_unique" RENAME TO "User_phoneNumber_key";

-- RenameIndex
ALTER INDEX "User.pseudonym_index" RENAME TO "User_pseudonym_idx";

-- RenameIndex
ALTER INDEX "User.pseudonym_unique" RENAME TO "User_pseudonym_key";

-- RenameIndex
ALTER INDEX "User.walletAddress_index" RENAME TO "User_walletAddress_idx";

-- RenameIndex
ALTER INDEX "User.walletAddress_unique" RENAME TO "User_walletAddress_key";

-- RenameIndex
ALTER INDEX "UserIdentity.provider_uid_unique" RENAME TO "UserIdentity_provider_uid_key";

-- RenameIndex
ALTER INDEX "UserIdentity.userId_index" RENAME TO "UserIdentity_userId_idx";

-- RenameIndex
ALTER INDEX "Waitlist.email_unique" RENAME TO "Waitlist_email_key";

-- RenameIndex
ALTER INDEX "Wallet.address_index" RENAME TO "Wallet_address_idx";

-- RenameIndex
ALTER INDEX "Wallet.userId_index" RENAME TO "Wallet_userId_idx";
