import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // An empty fallback allows schema validation and client generation in
    // environments that do not connect to PostgreSQL. Database commands still
    // require DATABASE_URL.
    url: process.env.DATABASE_URL ?? '',
  },
});
