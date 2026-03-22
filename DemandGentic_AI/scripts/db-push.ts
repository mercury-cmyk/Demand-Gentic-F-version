import '../server/env';
import { spawn } from 'child_process';

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

function writeSafely(stream: NodeJS.WriteStream, chunk: Buffer) {
  try {
    stream.write(chunk);
  } catch (error) {
    swallowBrokenPipe(error as NodeJS.ErrnoException);
  }
}

const databaseUrl = resolveDatabaseUrl();
if (!databaseUrl) {
  console.error('Database URL is required. Set DATABASE_URL_DEV or DATABASE_URL.');
  process.exit(1);
}

process.stdout.on('error', swallowBrokenPipe);
process.stderr.on('error', swallowBrokenPipe);

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(npxCommand, ['drizzle-kit', 'push', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
  shell: process.platform === 'win32',
  stdio: ['inherit', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => writeSafely(process.stdout, chunk));
child.stderr.on('data', (chunk) => writeSafely(process.stderr, chunk));

const exitCode: number = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', (code) => resolve(code ?? 1));
});

process.exit(exitCode);