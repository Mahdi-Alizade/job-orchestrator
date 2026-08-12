export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD, // Can be undefined safely if empty
  },

  jobs: {
    concurrency: parseInt(process.env.JOB_CONCURRENCY, 10) || 1,
    maxRetries: parseInt(process.env.JOB_MAX_RETRIES, 10) || 3,
    timeoutSeconds: parseInt(process.env.JOB_TIMEOUT_SECONDS, 10) || 60,
  }
});