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
    CROSSREF_API_KEY: string;
    CROSSREF_METADATA_API: string;
    ORCID_API_DOMAIN: string;
    CROSSREF_LOGIN: string;
    CROSSREF_PASSWORD: string;
    CROSSREF_NOTIFY_ENDPOINT: string;
  }
}
