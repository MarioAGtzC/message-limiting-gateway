import 'dotenv/config';
import { get } from 'env-var';

export const envs = {
  PORT: get('PORT').default(3000).asPortNumber(),
  DATABASE_URL: get('DATABASE_URL').default('postgresql://postgres:postgres@localhost:5432/messages').asString(),
  REDIS_HOST: get('REDIS_HOST').default('localhost').asString(),
  REDIS_PORT: get('REDIS_PORT').default(6379).asPortNumber(),
  MOCK_C_URL: get('MOCK_C_URL').default('http://localhost:3001').asString(),
}