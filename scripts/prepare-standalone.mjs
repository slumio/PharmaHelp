import { cpSync, mkdirSync } from 'node:fs';
cpSync('.next-production/static', '.next-production/standalone/.next-production/static', { recursive: true });

mkdirSync(".next-production/standalone/db", { recursive: true });
cpSync("db/schema.sql", ".next-production/standalone/db/schema.sql");
