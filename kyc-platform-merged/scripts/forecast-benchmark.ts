import path from 'path';
import { benchmarkForecasters } from '../lib/forecasting/benchmark';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function pctDelta(before: number | null, after: number | null): string {
  if (before == null || after == null || before === 0) return 'n/a';
  const delta = ((before - after) / before) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

function fmt(value: number | null): string {
  return value == null ? 'n/a' : value.toFixed(3);
}

async function main() {
  const horizon = Number.parseInt(parseArg('horizon') ?? '', 10) || 14;
  const minRealPoints = Number.parseInt(parseArg('minRealPoints') ?? '', 10) || 35;
  const maxSeries = Number.parseInt(parseArg('maxSeries') ?? '', 10);
  const outputPath = parseArg('output')
    ? path.resolve(process.cwd(), parseArg('output')!)
    : path.resolve(process.cwd(), 'reports/forecast-benchmark.latest.json');

  const report = await benchmarkForecasters({
    horizon,
    minRealPoints,
    maxSeries: Number.isFinite(maxSeries) ? maxSeries : undefined,
    outputPath,
  });

  console.log(`Forecast benchmark generated at ${report.generatedAt}`);
  console.log(`Source: ${report.source} (${report.snapshotCount} snapshots)`);
  console.log(`Eligible series: ${report.totalEligibleSeries}`);
  console.log(`Benchmarked series: ${report.benchmarkedSeries}`);
  console.log('');
  console.log('Before vs after');
  console.log(`MAE   ${fmt(report.before.avgMae)} -> ${fmt(report.after.avgMae)} (${pctDelta(report.before.avgMae, report.after.avgMae)})`);
  console.log(`RMSE  ${fmt(report.before.avgRmse)} -> ${fmt(report.after.avgRmse)} (${pctDelta(report.before.avgRmse, report.after.avgRmse)})`);
  console.log(`sMAPE ${fmt(report.before.avgSmape)} -> ${fmt(report.after.avgSmape)} (${pctDelta(report.before.avgSmape, report.after.avgSmape)})`);
  console.log(`DA    ${fmt(report.before.avgDirectionalAccuracy)} -> ${fmt(report.after.avgDirectionalAccuracy)}`);
  console.log(`Cov   ${fmt(report.before.avgCoverage)} -> ${fmt(report.after.avgCoverage)}`);
  console.log('');
  console.log('Model leaderboard');
  for (const row of report.byModel.slice(0, 8)) {
    console.log(
      `${row.modelId.padEnd(18)} sMAPE=${fmt(row.avgSmape)} MAE=${fmt(row.avgMae)} RMSE=${fmt(row.avgRmse)} wins=${row.championWins}`,
    );
  }
  console.log('');
  console.log(`Saved JSON report to ${outputPath}`);
}

main().catch((error) => {
  console.error('Forecast benchmark failed');
  console.error(error);
  process.exit(1);
});
