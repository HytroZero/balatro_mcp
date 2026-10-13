import { readFile } from 'node:fs/promises';
import { scoreHandOnce } from './index.ts';

try {
  const path = process.argv[2];
  const text = path && path !== '-' ? await readFile(path, 'utf8') : await new Promise<string>((accept, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('end', () => accept(input));
    process.stdin.on('error', reject);
  });
  const result = await scoreHandOnce(JSON.parse(text));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'ok') process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
