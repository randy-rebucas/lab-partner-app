// Local development database without Docker: runs the mongod binary that mongodb-memory-server
// downloaded (node_modules/.cache), with data kept in .data/db, on port 27018.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const cache = path.resolve('node_modules/.cache/mongodb-memory-server');
const binary = readdirSync(cache).find((f) => f.startsWith('mongod'));
if (!binary) {
  console.error('No mongod binary found. Run: pnpm rebuild mongodb-memory-server');
  process.exit(1);
}
const dbPath = path.resolve('.data/db');
mkdirSync(dbPath, { recursive: true });
console.log(`mongod on 127.0.0.1:27018, data in ${dbPath}`);
const child = spawn(path.join(cache, binary), ['--dbpath', dbPath, '--port', '27018', '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
