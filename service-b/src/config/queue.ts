import { Queue } from 'bullmq';
import { envs } from './envs';

export const messageQueue = new Queue('messages', {
  connection: {
    host: envs.REDIS_HOST || 'localhost',
    port: envs.REDIS_PORT || 6379,
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});