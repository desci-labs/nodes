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
    CROSS_REF_API: string;
    CROSS_REF_EMAIL: string;
    CROSS_REF_API_KEY: string;
  }
}
