import { cpSync } from 'node:fs';
cpSync('.next-production/static', '.next-production/standalone/.next-production/static', { recursive: true });
