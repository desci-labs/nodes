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
    CROSSREF_API: string;
    CROSSREF_EMAIL: string;
    CROSSREF_API_KEY: string;
  }
}
