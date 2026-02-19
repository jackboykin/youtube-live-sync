import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const headerPath = join(import.meta.dir, '../src/header.txt');
const compiledPath = join(import.meta.dir, '../dist/yt-actual-live.user.js');
const packageJsonPath = join(import.meta.dir, '../package.json');

const header = readFileSync(headerPath, 'utf-8');
const compiled = readFileSync(compiledPath, 'utf-8');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
const version = packageJson.version ?? '0.0.0';

const renderedHeader = header.includes('__VERSION__')
  ? header.replace('__VERSION__', version)
  : header.replace(/^\/\/ @version\s+.*$/m, `// @version      ${version}`);

const output = renderedHeader + '\n' + compiled;

writeFileSync(compiledPath, output, 'utf-8');

console.log('Header added to compiled userscript');
