/// <reference types="node" />

declare namespace NodeJS {
  interface ProcessEnv {
    PORT?: string;
    NODE_ENV?: string;
    REDIS_HOST?: string;
    REDIS_PORT?: string;
    REDIS_PASSWORD?: string;
    JOB_CONCURRENCY?: string;
    JOB_MAX_RETRIES?: string;
    JOB_TIMEOUT_SECONDS?: string;
  }
}