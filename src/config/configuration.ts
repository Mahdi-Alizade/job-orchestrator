export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jobs: {
    concurrency: parseInt(process.env.JOB_CONCURRENCY ?? '2', 10),
    maxRetries: parseInt(process.env.JOB_MAX_RETRIES ?? '3', 10),
    timeoutSeconds: parseInt(process.env.JOB_TIMEOUT_SECONDS ?? '30', 10),
  },

  sandbox: {
    timeoutMs: parseInt(process.env.SANDBOX_TIMEOUT_MS ?? '30000', 10),
    maxMemoryMb: parseInt(process.env.SANDBOX_MAX_MEMORY_MB ?? '512', 10),
  },
});