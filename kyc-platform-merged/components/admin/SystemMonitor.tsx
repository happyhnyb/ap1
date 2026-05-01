'use client';

import { useEffect, useState } from 'react';

type SystemStatus = {
  ok: boolean;
  time: string;
  host: {
    hostname: string;
    platform: string;
    uptimeSeconds: number;
    cpuCores: number;
    loadAverage: number[];
    memory: {
      totalMiB: number;
      freeMiB: number;
      usedMiB: number;
    };
    disk: {
      totalBytes: number;
      usedBytes: number;
      availableBytes: number;
      usedPercent: string;
      mount: string;
    } | null;
  };
  processes: Array<{
    name: string;
    online: boolean;
    status: string;
    pid: number | null;
    restarts: number;
    uptimeStartedAt: number | null;
    cpuPercent: number;
    memoryBytes: number;
  }>;
  logs: Array<{
    name: string;
    stdout: string[];
    stderr: string[];
  }>;
  error?: string;
};

function formatRelativeUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatProcessMemory(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function SystemMonitor() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch('/api/admin/system', { cache: 'no-store' });
        const json = await response.json() as SystemStatus;
        if (!response.ok) {
          throw new Error(json.error || 'Failed to load system status.');
        }
        if (!active) return;
        setStatus(json);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load system status.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const interval = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section className="card admin-panel" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="serif" style={{ margin: 0, fontSize: 20 }}>System Monitor</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Live host stats, PM2 process state, and recent logs for the Mac backend.
          </p>
        </div>
        <div style={{ fontSize: 12, color: 'var(--dim)' }}>
          {status ? `Updated ${new Date(status.time).toLocaleTimeString('en-IN')}` : 'Loading…'}
        </div>
      </div>

      {error ? (
        <div style={{ padding: 14, borderRadius: 12, border: '1px solid rgba(220,38,38,.25)', background: 'rgba(220,38,38,.08)', color: '#fca5a5' }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,.02)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Host</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>{status?.host.hostname || '—'}</div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13 }}>{status?.host.platform || '—'}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,.02)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.08em' }}>CPU</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>{status?.host.cpuCores ?? '—'} cores</div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13 }}>
            Load avg: {status ? status.host.loadAverage.map((value) => value.toFixed(2)).join(' / ') : '—'}
          </div>
        </div>
        <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,.02)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Memory</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>{status?.host.memory.usedMiB ?? '—'} MiB used</div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13 }}>
            Free: {status?.host.memory.freeMiB ?? '—'} MiB
          </div>
        </div>
        <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(255,255,255,.02)' }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Disk</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>{status?.host.disk?.usedPercent || '—'} used</div>
          <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 13 }}>
            Mount: {status?.host.disk?.mount || '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {status?.processes.map((process) => (
          <div key={process.name} style={{ padding: 16, borderRadius: 14, border: '1px solid var(--border)', background: 'rgba(255,255,255,.02)', display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <strong>{process.name}</strong>
              <span className={`badge ${process.online ? 'badge-green' : ''}`}>
                {process.status}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>PID: {process.pid ?? '—'}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>CPU: {process.cpuPercent.toFixed(1)}%</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Memory: {formatProcessMemory(process.memoryBytes)}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Restarts: {process.restarts}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Started: {process.uptimeStartedAt ? new Date(process.uptimeStartedAt).toLocaleString('en-IN') : '—'}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {status?.logs.map((log) => (
          <div key={log.name} style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 600 }}>{log.name} logs</div>
            <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: '#111315' }}>
              <div style={{ fontSize: 12, color: '#8dd3c7', marginBottom: 8 }}>stdout</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.55, color: '#d1d5db', maxHeight: 240, overflow: 'auto' }}>
                {log.stdout.length ? log.stdout.join('\n') : 'No stdout lines yet.'}
              </pre>
            </div>
            <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: '#1a1010' }}>
              <div style={{ fontSize: 12, color: '#fda4af', marginBottom: 8 }}>stderr</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.55, color: '#fecaca', maxHeight: 200, overflow: 'auto' }}>
                {log.stderr.length ? log.stderr.join('\n') : 'No stderr lines yet.'}
              </pre>
            </div>
          </div>
        ))}
      </div>

      {!status && loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Fetching live backend telemetry…</div>
      ) : null}

      {status ? (
        <div style={{ color: 'var(--dim)', fontSize: 12 }}>
          Host uptime: {formatRelativeUptime(status.host.uptimeSeconds)}
        </div>
      ) : null}
    </section>
  );
}
