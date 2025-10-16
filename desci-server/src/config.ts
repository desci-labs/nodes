/**
 * ENV consts here, to prevent having to restart the server in local development
 * everytime we make changes.
 *
 * Note: DON'T FORGET TO NOT COMMIT THIS FILE TO VC IF YOUR CHANGE IS TEMPORARY FOR TESTING.
 */

// Core Server Configuration
export const PORT = process.env.PORT;
export const NODE_ENV = process.env.NODE_ENV;

// Database Configuration
export const PG_HOST = process.env.PG_HOST;
export const PG_PORT = process.env.PG_PORT;
export const POSTGRES_USER = process.env.POSTGRES_USER;
export const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD;
export const POSTGRES_DB = process.env.POSTGRES_DB;
export const OPEN_ALEX_DATABASE_URL = process.env.OPEN_ALEX_DATABASE_URL;

// JWT Configuration
export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_EXPIRATION = process.env.JWT_EXPIRATION;

// Redis Configuration
export const REDIS_HOST = process.env.REDIS_HOST;
export const REDIS_PORT = process.env.REDIS_PORT;

// CrossRef Configuration
export const CROSSREF_EMAIL = process.env.CROSSREF_EMAIL;
export const CROSSREF_DOI_URL = process.env.CROSSREF_DOI_URL;
export const CROSSREF_METADATA_API = process.env.CROSSREF_METADATA_API;
export const CROSSREF_LOGIN = process.env.CROSSREF_LOGIN;
export const CROSSREF_LOGIN_ROLE = process.env.CROSSREF_LOGIN_ROLE;
export const CROSSREF_PASSWORD = process.env.CROSSREF_PASSWORD;
export const CROSSREF_NOTIFY_ENDPOINT = process.env.CROSSREF_NOTIFY_ENDPOINT;
export const CROSSREF_API_KEY = process.env.CROSSREF_API_KEY;

// ORCID Configuration
export const ORCID_API_DOMAIN = process.env.ORCID_API_DOMAIN;
export const ORCID_PUBLIC_API = process.env.ORCID_PUBLIC_API;

// Google OAuth Configuration
export const GOOGLE_CLIENT_ID_AUTH = process.env.GOOGLE_CLIENT_ID_AUTH;
export const SCIWEAVE_GOOGLE_CLIENT_ID = process.env.SCIWEAVE_GOOGLE_CLIENT_ID;

// Email Configuration
export const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
export const SENDGRID_TEMPLATE_ID_MAP = process.env.SENDGRID_TEMPLATE_ID_MAP;
export const SCIWEAVE_SENDGRID_TEMPLATE_ID_MAP = process.env.SCIWEAVE_SENDGRID_TEMPLATE_ID_MAP;
export const SHOULD_SEND_EMAIL = true || process.env.SHOULD_SEND_EMAIL;

// URL Configuration
export const SERVER_URL = process.env.SERVER_URL;
export const DAPP_URL = process.env.DAPP_URL;
export const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
export const NODES_MEDIA_SERVER_URL = process.env.NODES_MEDIA_SERVER_URL;

// Stripe Configuration
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const STRIPE_AI_REFEREE_FINDER_MONTHLY_PRICE_ID = process.env.STRIPE_AI_REFEREE_FINDER_MONTHLY_PRICE_ID;
export const STRIPE_AI_REFEREE_FINDER_ANNUAL_PRICE_ID = process.env.STRIPE_AI_REFEREE_FINDER_ANNUAL_PRICE_ID;
export const STRIPE_OMNI_CHATS_MONTHLY_PRICE_ID = process.env.STRIPE_OMNI_CHATS_MONTHLY_PRICE_ID;
export const STRIPE_OMNI_CHATS_ANNUAL_PRICE_ID = process.env.STRIPE_OMNI_CHATS_ANNUAL_PRICE_ID;
export const STRIPE_PREMIUM_MONTHLY_PRICE_ID = process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID;
export const STRIPE_PREMIUM_ANNUAL_PRICE_ID = process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID;
// Sciweave coupons
export const STRIPE_STUDENT_DISCOUNT_COUPON_ID = process.env.STRIPE_STUDENT_DISCOUNT_COUPON_ID;
export const STRIPE_USER_DISCOUNT_COUPON_ID = process.env.STRIPE_USER_DISCOUNT_COUPON_ID;
export const SCIWEAVE_USER_DISCOUNT_PERCENT = parseInt(process.env.SCIWEAVE_USER_DISCOUNT_PC || '5', 10);
export const SCIWEAVE_STUDENT_DISCOUNT_PERCENT = parseInt(process.env.SCIWEAVE_STUDENT_DISCOUNT_PC || '5', 10);

// AWS Configuration
export const AWS_REGION = process.env.AWS_REGION;
export const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
export const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

// AWS SQS Configuration
export const AWS_SQS_ACCESS_KEY_ID = process.env.AWS_SQS_ACCESS_KEY_ID;
export const AWS_SQS_SECRET_ACCESS_KEY = process.env.AWS_SQS_SECRET_ACCESS_KEY;
export const AWS_SQS_REGION = process.env.AWS_SQS_REGION;
export const AWS_SQS_DATA_MIGRATION_QUEUE_URL = process.env.AWS_SQS_DATA_MIGRATION_QUEUE_URL;
export const AWS_SQS_ML_TOOL_QUEUE_URL = process.env.AWS_SQS_ML_TOOL_QUEUE_URL;

// Machine Learning / AI Configuration
export const REFEREE_RECOMMENDER_S3_BUCKET = process.env.REFEREE_RECOMMENDER_S3_BUCKET;
export const REFEREE_RECOMMENDER_VERSION = process.env.REFEREE_RECOMMENDER_VERSION;
export const ML_REFEREE_TRIGGER_CID = process.env.ML_REFEREE_TRIGGER_CID;
export const ML_REFEREE_FINDER_RESULT = process.env.ML_REFEREE_FINDER_RESULT;
export const AUTOMATED_METADATA_API = process.env.AUTOMATED_METADATA_API;
export const AUTOMATED_METADATA_API_KEY = process.env.AUTOMATED_METADATA_API_KEY;

// Repository Service Configuration
export const REPO_SERVICE_SECRET_KEY = process.env.REPO_SERVICE_SECRET_KEY;
export const REPO_SERVER_URL = process.env.REPO_SERVER_URL;

// Cloudflare Configuration
export const CLOUDFLARE_WORKER_API = process.env.CLOUDFLARE_WORKER_API;
export const CLOUDFLARE_WORKER_API_SECRET = process.env.CLOUDFLARE_WORKER_API_SECRET;
export const ENABLE_WORKERS_API = process.env.ENABLE_WORKERS_API;

// IPFS Configuration
export const IPFS_RESOLVER_OVERRIDE = process.env.IPFS_RESOLVER_OVERRIDE;

// ElasticSearch Configuration
export const ELASTIC_SEARCH_LOCAL_DEV_DPID_NAMESPACE = process.env.ELASTIC_SEARCH_LOCAL_DEV_DPID_NAMESPACE;

// Security & Encryption
export const LOG_ENCRYPTION_KEY = process.env.LOG_ENCRYPTION_KEY;
export const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;

// Script Execution Controls
export const ENABLE_SOCIAL_DATA_SEED_SCRIPTS = process.env.ENABLE_SOCIAL_DATA_SEED_SCRIPTS;

// Miscellaneous
export const MAX_LOCK_TIME = process.env.MAX_LOCK_TIME;
export const npm_package_version = process.env.npm_package_version;

// Feature Limits Configuration (For new users)
export const SCIWEAVE_FREE_LIMIT = parseInt(process.env.SCIWEAVE_FREE_LIMIT || '20');
