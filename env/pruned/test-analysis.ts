import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { projectRoot } from '../../src/config.ts';

const result = spawnSync(process.execPath, ['--test', resolve(projectRoot, 'tests/analysis.test.ts'), resolve(projectRoot, 'tests/discards.test.ts')], {
  cwd: projectRoot,
  env: { ...process.env, BALATRO_ANALYSIS_TEST_SOURCE: resolve(projectRoot, 'env/pruned') },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
