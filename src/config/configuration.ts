export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: (process.env.NODE_ENV as string) || 'development',
  
  redis: {
    host: (process.env.REDIS_HOST as string) || 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jobs: {
    concurrency: parseInt(process.env.JOB_CONCURRENCY ?? '1', 10),
    maxRetries: parseInt(process.env.JOB_MAX_RETRIES ?? '3', 10),
    timeoutSeconds: parseInt(process.env.JOB_TIMEOUT_SECONDS ?? '60', 10),
  }
});