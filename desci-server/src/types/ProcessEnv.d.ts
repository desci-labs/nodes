declare namespace NodeJS {
  export interface ProcessEnv {
    PORT: string;
    NODE_ENV: string;
    PG_HOST: string;
    PG_PORT: string;
    POSTGRES_USER: string;
    POSTGRES_PASSWORD: string;
    POSTGRES_DB: string;
    JWT_SECRET: string;
    JWT_EXPIRATION: string;
    MAX_LOCK_TIME: string;
    CROSSREF_EMAIL: string;
    CROSSREF_DOI_URL: string;
    CROSSREF_METADATA_API: string;
    ORCID_API_DOMAIN: string;
    CROSSREF_LOGIN: string;
    CROSSREF_LOGIN_ROLE: string;
    CROSSREF_PASSWORD: string;
    CROSSREF_NOTIFY_ENDPOINT: string;
    CROSSREF_API_KEY: string;
    AUTOMATED_METADATA_API: string;
    AUTOMATED_METADATA_API_KEY: string;
    IPFS_RESOLVER_OVERRIDE: string;
    ORCID_PUBLIC_API: string;
  }
}
