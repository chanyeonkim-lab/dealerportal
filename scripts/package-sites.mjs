import { cpSync, rmSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true });
cpSync('preview-dist', 'dist', { recursive: true });
