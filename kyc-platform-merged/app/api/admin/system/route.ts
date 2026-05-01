import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);
const PM2_HOME = process.env.PM2_HOME || path.join(os.homedir(), '.pm2');
const PM2_LOGS_DIR = path.join(PM2_HOME, 'logs');
const PROCESS_NAMES = ['kyc-platform', 'kyc-predictor'];
const LOG_LINE_LIMIT = 60;

type Pm2Entry = {
  name?: string;
  pid?: number;
  pm2_env?: {
    status?: string;
    restart_time?: number;
    pm_uptime?: number;
  };
  monit?: {
    cpu?: number;
    memory?: number;
  };
};

async function readLastLines(filePath: string, maxLines: number) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-maxLines);
  } catch {
    return [];
  }
}

async function getPm2Processes() {
  try {
    const { stdout } = await execFileAsync('pm2', ['jlist']);
    const entries = JSON.parse(stdout) as Pm2Entry[];

    return PROCESS_NAMES.map((name) => {
      const match = entries.find((entry) => entry.name === name);
      return {
        name,
        online: match?.pm2_env?.status === 'online',
        status: match?.pm2_env?.status || 'stopped',
        pid: match?.pid || null,
        restarts: match?.pm2_env?.restart_time ?? 0,
        uptimeStartedAt: match?.pm2_env?.pm_uptime ?? null,
        cpuPercent: match?.monit?.cpu ?? 0,
        memoryBytes: match?.monit?.memory ?? 0,
      };
    });
  } catch {
    return PROCESS_NAMES.map((name) => ({
      name,
      online: false,
      status: 'unavailable',
      pid: null,
      restarts: 0,
      uptimeStartedAt: null,
      cpuPercent: 0,
      memoryBytes: 0,
    }));
  }
}

async function getDiskUsage() {
  try {
    const { stdout } = await execFileAsync('df', ['-k', '/']);
    const lines = stdout.trim().split(/\r?\n/);
    const row = lines[lines.length - 1]?.trim().split(/\s+/);
    if (!row || row.length < 6) return null;

    const totalKb = Number(row[1]);
    const usedKb = Number(row[2]);
    const availableKb = Number(row[3]);
    const usedPercent = row[4];

    return {
      totalBytes: totalKb * 1024,
      usedBytes: usedKb * 1024,
      availableBytes: availableKb * 1024,
      usedPercent,
      mount: row[5],
    };
  } catch {
    return null;
  }
}

async function getRecentLogs() {
  const logs = await Promise.all(
    PROCESS_NAMES.map(async (name) => {
      const [stdoutLines, stderrLines] = await Promise.all([
        readLastLines(path.join(PM2_LOGS_DIR, `${name}-out.log`), LOG_LINE_LIMIT),
        readLastLines(path.join(PM2_LOGS_DIR, `${name}-error.log`), LOG_LINE_LIMIT),
      ]);

      return {
        name,
        stdout: stdoutLines,
        stderr: stderrLines,
      };
    })
  );

  return logs;
}

function bytesToMiB(value: number) {
  return Number((value / 1024 / 1024).toFixed(1));
}

export async function GET() {
  const session = await getServerSession();
  if (!isEditor(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [processes, disk, logs] = await Promise.all([
    getPm2Processes(),
    getDiskUsage(),
    getRecentLogs(),
  ]);

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();

  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: `${os.platform()} ${os.release()}`,
      uptimeSeconds: os.uptime(),
      cpuCores: os.cpus().length,
      loadAverage: os.loadavg(),
      memory: {
        totalBytes: totalMemory,
        freeBytes: freeMemory,
        usedBytes: totalMemory - freeMemory,
        totalMiB: bytesToMiB(totalMemory),
        freeMiB: bytesToMiB(freeMemory),
        usedMiB: bytesToMiB(totalMemory - freeMemory),
      },
      disk,
    },
    processes,
    logs,
  });
}
