import { ActionType, User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import logger from 'logger';
import { saveInteraction } from 'services/interactionLog';

/**
 * TODO: Put this in desci-models?
 */
export enum AvailableUserActionLogTypes {
  btnDownloadData = 'btnDownloadData',
  btnDownloadManuscript = 'btnDownloadManuscript',
  btnShare = 'btnShare',
  btnPublish = 'btnPublish',
  btnAddComponentFab = 'btnAddComponentFab',
  btnAddComponentDrive = 'btnAddComponentDrive',
  btnAddComponentDriveNewComponent = 'btnAddComponentDriveNewComponent',
  btnAddComponentDriveNewFolder = 'btnAddComponentDriveNewFolder',
  driveNavigateBreadcrumb = 'driveNavigateBreadcrumb',
  btnFigureAnnotate = 'btnFigureAnnotate',
  btnContinuePublish = 'btnContinuePublish',
  btnReviewBeforePublish = 'btnReviewBeforePublish',
  dismissCommitAdditionalInfo = 'dismissCommitAdditionalInfo',
  dismissCommitStatus = 'dismissCommitStatus',
  completePublish = 'completePublish',
  btnSignPublish = 'btnSignPublish',
  commitPanelDismiss = 'commitPanelDismiss',
  viewWalletSettings = 'viewWalletSettings',
  walletMoreOptions = 'walletMoreOptions',
  walletSwitchChain = 'walletSwitchChain',
  walletClickCard = 'walletClickCard',
  walletError = 'walletError',
  walletDisconnect = 'walletDisconnect',
  connectWallet = 'connectWallet',
  btnComponentCardCite = 'btnComponentCardCite',
  btnComponentCardViewFile = 'btnComponentCardViewFile',
  btnComponentCardUse = 'btnComponentCardUse',
  btnComponentCardViewLink = 'btnComponentCardViewLink',
  btnComponentCardViewMetadata = 'btnComponentCardViewMetadata',
  viewDrive = 'viewDrive',
  btnDriveCite = 'btnDriveCite',
  btnDriveUse = 'btnDriveUse',
  btnDriveStarToggle = 'btnDriveStarToggle',
  saveMetadata = 'saveMetadata',
  btnInspectMetadata = 'btnInspectMetadata',
  ctxDriveRename = 'ctxDriveRename',
  ctxDrivePreview = 'ctxDrivePreview',
  ctxDriveDownload = 'ctxDriveDownload',
  ctxDriveDelete = 'ctxDriveDelete',
  ctxDriveAssignType = 'ctxDriveAssignType',
  ctxDriveEditMetadata = 'ctxDriveEditMetadata',
  btnCreateNewNode = 'btnCreateNewNode',
  btnCreateNodeModalSave = 'btnCreateNodeModalSave',
  errNodeCreate = 'errNodeCreate',
  viewedNode = 'viewedNode',
}

/**
 * Note: user not guaranteed
 */
export const logUserAction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user as User;
    const action = req.body.action as AvailableUserActionLogTypes;
    const message = req.body.message as string;

    if (!action || !AvailableUserActionLogTypes[action]) {
      res.status(400).send({
        logged: false,
        message: 'Invalid action in body',
        availableActions: Object.keys(AvailableUserActionLogTypes),
      });
      return;
    }

    const trimmedUser = user ? { id: user.id, email: user.email } : null;
    const actionData = {
      action,
      message: message || null,
      user: trimmedUser,
    };
    await saveInteraction(req, ActionType.USER_ACTION, actionData, user?.id);

    res.send({
      ok: true,
    });

    return;
  } catch (err) {
    logger.error({ fn: 'logUserAction', err }, 'error');
    res.status(500).send({ err });
    return;
  }
};
