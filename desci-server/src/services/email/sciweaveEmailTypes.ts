export enum SciweaveEmailTypes {
  SCIWEAVE_WELCOME_EMAIL = 'SCIWEAVE_WELCOME_EMAIL',
  SCIWEAVE_UPGRADE_EMAIL = 'SCIWEAVE_UPGRADE_EMAIL',
  SCIWEAVE_CANCELLATION_EMAIL = 'SCIWEAVE_CANCELLATION_EMAIL',
  SCIWEAVE_14_DAY_INACTIVITY = 'SCIWEAVE_14_DAY_INACTIVITY',
}

export type WelcomeEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_WELCOME_EMAIL;
  payload: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
};

export type UpgradeEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_UPGRADE_EMAIL;
  payload: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
};

export type CancellationEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_CANCELLATION_EMAIL;
  payload: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
};

export type InactivityEmailPayload = {
  type: SciweaveEmailTypes.SCIWEAVE_14_DAY_INACTIVITY;
  payload: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
};

export type SciweaveEmailProps =
  | WelcomeEmailPayload
  | UpgradeEmailPayload
  | CancellationEmailPayload
  | InactivityEmailPayload;
