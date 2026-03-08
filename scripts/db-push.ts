import '../server/env';
import path from 'path';
import { pathToFileURL } from 'url';

function resolveDatabaseUrl(): string {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();

  if (process.env.REPLIT_DEPLOYMENT === '1') {
    return process.env.REPLIT_PRODUCTION_DATABASE_URL || '';
  }

  if (nodeEnv === 'production') {
    return process.env.DATABASE_URL_PROD || process.env.DATABASE_URL || '';
  }

  return process.env.DATABASE_URL_DEV || process.env.DATABASE_URL || '';
}

function swallowBrokenPipe(error: NodeJS.ErrnoException) {
  if (error?.code === 'EPIPE') {
    return;
  }
  throw error;
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error('Database URL is required. Set DATABASE_URL_DEV or DATABASE_URL.');
  process.exit(1);
}

process.env.DATABASE_URL = databaseUrl;
process.stdout.on('error', swallowBrokenPipe);
process.stderr.on('error', swallowBrokenPipe);

const drizzleBin = path.resolve('node_modules', 'drizzle-kit', 'bin.cjs');
const cliArgs = process.argv.slice(2);
const hasConfigArg = cliArgs.includes('--config');
const effectiveArgs = hasConfigArg ? cliArgs : ['--config', 'drizzle.config.ts', ...cliArgs];
process.argv = [process.execPath, drizzleBin, 'push', ...effectiveArgs];

await import(pathToFileURL(drizzleBin).href);
