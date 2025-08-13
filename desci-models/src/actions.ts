export enum AvailableUserActionLogTypes {
  // Authentication & User Actions
  actionClaimBadgeButtonClicked = 'actionClaimBadgeButtonClicked',
  actionGuestModeVisit = 'actionGuestModeVisit',
  actionSignInCompleted = 'actionSignInCompleted',
  actionSignInPageViewed = 'actionSignInPageViewed',
  actionUserSignedUp = 'actionUserSignedUp',
  actionUserNameClicked = 'actionUserNameClicked',

  // Research Object Creation & Publishing
  actionCreateResearchObjectInitiated = 'actionCreateResearchObjectInitiated',
  actionPublishConfirmationModalViewed = 'actionPublishConfirmationModalViewed',
  actionPublishConfirmationStepCompleted = 'actionPublishConfirmationStepCompleted',
  actionPublishResearchObjectInitiated = 'actionPublishResearchObjectInitiated',
  actionResearchObjectFlowDropped = 'actionResearchObjectFlowDropped',
  actionResearchObjectOpened = 'actionResearchObjectOpened',
  actionResearchObjectPublished = 'actionResearchObjectPublished',
  actionResearchObjectStepCompleted = 'actionResearchObjectStepCompleted',
  actionResearchObjectStepViewed = 'actionResearchObjectStepViewed',
  actionResearchObjectUpdated = 'actionResearchObjectUpdated',
  actionSaveDraftClicked = 'actionSaveDraftClicked',
  actionSuccessModalViewed = 'actionSuccessModalViewed',
  chooseCreateResearchObject = 'chooseCreateResearchObject',
  completeCreateResearchObjectFlow = 'completeCreateResearchObjectFlow',
  startCreateResearchObjectFlow = 'startCreateResearchObjectFlow',

  // Search & Navigation
  actionRelatedArticleClickedInAi = 'actionRelatedArticleClickedInAi',
  actionRelatedLinkClicked = 'actionRelatedLinkClicked',
  actionSearchBarUsed = 'actionSearchBarUsed',
  actionSearchPerformed = 'actionSearchPerformed',
  actionSearchResultClicked = 'actionSearchResultClicked',
  btnSidebarNavigation = 'btnSidebarNavigation',
  search = 'search',

  // Component & Drive Actions
  btnAddComponentDrive = 'btnAddComponentDrive',
  btnAddComponentDriveNewComponent = 'btnAddComponentDriveNewComponent',
  btnAddComponentDriveNewFolder = 'btnAddComponentDriveNewFolder',
  btnAddComponentFab = 'btnAddComponentFab',
  btnComponentCardCite = 'btnComponentCardCite',
  btnComponentCardUse = 'btnComponentCardUse',
  btnComponentCardViewFile = 'btnComponentCardViewFile',
  btnComponentCardViewLink = 'btnComponentCardViewLink',
  btnComponentCardViewMetadata = 'btnComponentCardViewMetadata',
  btnDriveCite = 'btnDriveCite',
  btnDriveStarToggle = 'btnDriveStarToggle',
  btnDriveUse = 'btnDriveUse',
  btnFigureAnnotate = 'btnFigureAnnotate',
  btnInspectMetadata = 'btnInspectMetadata',
  ctxDriveAssignType = 'ctxDriveAssignType',
  ctxDriveDelete = 'ctxDriveDelete',
  ctxDriveDownload = 'ctxDriveDownload',
  ctxDriveEditMetadata = 'ctxDriveEditMetadata',
  ctxDriveMove = 'ctxDriveMove',
  ctxDrivePreview = 'ctxDrivePreview',
  ctxDriveRename = 'ctxDriveRename',
  driveNavigateBreadcrumb = 'driveNavigateBreadcrumb',
  saveMetadata = 'saveMetadata',
  viewDrive = 'viewDrive',

  // Wallet & Blockchain Actions
  connectWallet = 'connectWallet',
  walletClickCard = 'walletClickCard',
  walletDisconnect = 'walletDisconnect',
  walletError = 'walletError',
  walletMoreOptions = 'walletMoreOptions',
  walletSwitchChain = 'walletSwitchChain',
  viewWalletSettings = 'viewWalletSettings',

  // Community & Sharing Actions
  actionAuthorProfileViewed = 'actionAuthorProfileViewed',
  actionCoAuthorInvited = 'actionCoAuthorInvited',
  actionCommunityPublicationCreated = 'actionCommunityPublicationCreated',
  actionLinkCopiedFromSuccessModal = 'actionLinkCopiedFromSuccessModal',
  actionResearchObjectShared = 'actionResearchObjectShared',
  actionSharedViaLinkedInFromSuccessModal = 'actionSharedViaLinkedInFromSuccessModal',
  actionSharedViaTwitterFromSuccessModal = 'actionSharedViaTwitterFromSuccessModal',
  btnShare = 'btnShare',
  clickedShareYourResearch = 'clickedShareYourResearch',
  declineAttestationClaim = 'declineAttestationClaim',
  rejectCommunitySubmission = 'rejectCommunitySubmission',

  // Profile & Node Management
  btnCreateNewNode = 'btnCreateNewNode',
  btnCreateNodeModalSave = 'btnCreateNodeModalSave',
  btnProfileCreateNewResearchObject = 'btnProfileCreateNewResearchObject',
  btnProfileCreateNewSubmissionPackage = 'btnProfileCreateNewSubmissionPackage',
  tabProfileAllNodes = 'tabProfileAllNodes',
  tabProfilePublishedNodes = 'tabProfilePublishedNodes',
  tabProfileSharedNodes = 'tabProfileSharedNodes',
  viewedNode = 'viewedNode',

  // Analytics & AI
  actionAiAnalyticsTabClicked = 'actionAiAnalyticsTabClicked',

  // Submission Package Actions
  chooseCreateSubmissionPackage = 'chooseCreateSubmissionPackage',
  completeCreateSubmissionPackageFlow = 'completeCreateSubmissionPackageFlow',
  startCreateSubmissionPackageFlow = 'startCreateSubmissionPackageFlow',

  // Publishing Flow Actions
  btnContinuePublish = 'btnContinuePublish',
  btnPublish = 'btnPublish',
  btnPublishActivityBar = 'btnPublishActivityBar',
  btnReviewBeforePublish = 'btnReviewBeforePublish',
  btnSignPublish = 'btnSignPublish',
  commitPanelDismiss = 'commitPanelDismiss',
  completePublish = 'completePublish',
  dismissCommitAdditionalInfo = 'dismissCommitAdditionalInfo',
  dismissCommitStatus = 'dismissCommitStatus',
  publishCheckPermissions = 'publishCheckPermissions',
  publishCheckPermissionsError = 'publishCheckPermissionsError',
  publishCheckPermissionsSuccess = 'publishCheckPermissionsSuccess',
  publishStep = 'publishStep',

  // Download Actions
  btnDownloadData = 'btnDownloadData',
  btnDownloadManuscript = 'btnDownloadManuscript',

  // Error & Status Actions
  automergeError = 'automergeError',
  errNodeCreate = 'errNodeCreate',
  publishError = 'publishError',

  // Onboarding
  viewedOnboarding = 'viewedOnboarding',

  // AI Chat Actions
  aiCitationClicked = 'aiCitationClicked',
  aiChatQuery = 'aiChatQuery',
  aiChatFollowUp = 'aiChatFollowUp',
  aiChatShared = 'aiChatShared',
  aiChatThreadClicked = 'aiChatThreadClicked',

  // Referee finder
  actionRefereeFinderFileOpened = 'actionRefereeFinderFileOpened',
  actionRefereeFinderFileUploaded = 'actionRefereeFinderFileUploaded',
  actionViewRefereeFinder = 'actionViewRefereeFinder',

  // Semantic Search
  actionSemanticSearchQuery = 'actionSemanticSearchQuery',

  // Journals user actions
  actionJournalNavButtonClicked = 'actionJournalNavButtonClicked',
  actionJournalInviteEditor = 'actionJournalInviteEditor',
  actionJournalRemoveEditor = 'actionJournalRemoveEditor',
  actionJournalUpdateEditorRole = 'actionJournalUpdateEditorRole',
  actionJournalAssignEditor = 'actionJournalAssignEditor',
  actionJournalInviteReferee = 'actionJournalInviteReferee',
  actionJournalRefereeInviteAccepted = 'actionJournalRefereeInviteAccepted',
  actionJournalRefereeInviteRejected = 'actionJournalRefereeInviteRejected',
  actionJournalRefereeInviteInvalidated = 'actionJournalRefereeInviteInvalidated',
  actionJournalAcceptSubmission = 'actionJournalAcceptSubmission',
  actionJournalRejectSubmission = 'actionJournalRejectSubmission',
  actionJournalRevisionRequest = 'actionJournalRevisionRequest',
}
