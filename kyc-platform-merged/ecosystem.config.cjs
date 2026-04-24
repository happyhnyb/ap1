const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const content = fs.readFileSync(filePath, 'utf8');
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) return acc;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const unquoted = rawValue.replace(/^(['"])(.*)\1$/, '$2');

    acc[key] = unquoted;
    return acc;
  }, {});
}

const cwd = __dirname;
const envLocal = parseEnvFile(path.join(cwd, '.env.local'));
const envProduction = parseEnvFile(path.join(cwd, '.env.production.local'));
const runtimeEnv = { ...envLocal, ...envProduction };
const port = runtimeEnv.LOCAL_SERVER_PORT || runtimeEnv.PORT || '3000';

module.exports = {
  apps: [
    {
      name: 'kyc-platform',
      script: 'npm',
      args: 'start',
      cwd,
      interpreter: 'none',
      autorestart: true,
      max_memory_restart: '1G',
      restart_delay: 5000,
      time: true,
      env: {
        ...runtimeEnv,
        NODE_ENV: 'production',
        PORT: port,
        LOCAL_SERVER_PORT: port,
      },
    },
    {
      name: 'kyc-predictor',
      script: 'npm',
      args: 'run mandi:start',
      cwd,
      interpreter: 'none',
      autorestart: true,
      max_memory_restart: '512M',
      restart_delay: 5000,
      time: true,
      env: {
        ...runtimeEnv,
        NODE_ENV: 'production',
      },
    },
  ],
};
