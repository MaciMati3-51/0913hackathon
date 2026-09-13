import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'pair.html', 'display.html', '404.html', 'assets', '_routes.json']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
console.log('Static files built in dist/');
