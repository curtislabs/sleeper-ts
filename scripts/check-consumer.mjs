// Install the packed package into a fresh project and use it as a consumer:
// type-check test/consumer/consumer.ts and every README TypeScript snippet
// under strict nodenext and bundler resolution, then run the consumer and a
// CommonJS require.
//
// Usage: npm run check:consumer (builds dist/, then this script packs it into
// a temporary directory).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'sleeper-ts-consumer-'));
const run = (cmd, args) => execFileSync(cmd, args, { cwd: dir, stdio: 'inherit' });

const packed = execFileSync('npm', ['pack', '--json', '--pack-destination', dir], {
  cwd: repo,
  encoding: 'utf8',
});
// npm <= 11 prints an array; npm 12 prints an object keyed by package name.
const info = JSON.parse(packed);
const tarball = join(dir, (Array.isArray(info) ? info[0] : Object.values(info)[0]).filename);

writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module' }));
run('npm', [
  'install',
  '--no-audit',
  '--no-fund',
  tarball,
  `typescript@${pkg.devDependencies.typescript}`,
  `@types/node@${pkg.devDependencies['@types/node']}`,
]);

copyFileSync(join(repo, 'test/consumer/consumer.ts'), join(dir, 'consumer.ts'));
// README snippets: each block becomes its own module. Names a snippet uses
// but doesn't define (an import, `client`, `user`, `img`) are
// supplied, so each block type-checks on its own.
const readme = readFileSync(join(repo, 'README.md'), 'utf8');
const snippets = [...readme.matchAll(/```typescript\n([\s\S]*?)```/g)].map((m) => m[1]);
const defines = (code, name) =>
  new RegExp(`(const|let|import[^;]*\\b)\\s*${name}\\b|\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(
    code,
  );
const uses = (code, name) => new RegExp(`\\b${name}\\b`).test(code);
snippets.forEach((code, i) => {
  const lines = ['export {};'];
  if (uses(code, 'SleeperClient') && !defines(code, 'SleeperClient')) {
    lines.push("import { SleeperClient } from '@curtislabs/sleeper-ts';");
  }
  if (uses(code, 'client') && !defines(code, 'client')) {
    lines.push("import { SleeperClient as __Client } from '@curtislabs/sleeper-ts';");
    lines.push('const client = new __Client();');
  }
  if (uses(code, 'user') && !defines(code, 'user')) {
    lines.push("import type { User as __User } from '@curtislabs/sleeper-ts';");
    lines.push('declare const user: __User;');
  }
  if (uses(code, 'img')) lines.push('declare const img: { src: string };');
  writeFileSync(join(dir, `readme-${i}.ts`), `${lines.join('\n')}\n${code}`);
});

// Type-check under both module resolutions consumers use: Node's own
// (nodenext) and bundlers' (bundler).
for (const resolution of ['nodenext', 'bundler']) {
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2022',
        module: resolution === 'bundler' ? 'esnext' : 'nodenext',
        moduleResolution: resolution,
        types: ['node'],
        skipLibCheck: false,
      },
      include: ['*.ts'],
    }),
  );
  run('npx', ['tsc', '-p', '.']);
  console.log(`Type-checked the consumer and ${snippets.length} README snippets (${resolution}).`);
}

// Run the consumer (Node strips the types) and a CommonJS require.
run('node', ['--experimental-strip-types', '--no-warnings', 'consumer.ts']);
run('node', [
  '--no-warnings',
  '-e',
  "const m = require('@curtislabs/sleeper-ts'); if (typeof m.SleeperClient !== 'function') process.exit(1); console.log('require ok');",
]);
