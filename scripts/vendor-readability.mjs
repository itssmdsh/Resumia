import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../node_modules/@mozilla/readability/Readability.js', import.meta.url));
const target = fileURLToPath(new URL('../extension/vendor/Readability.js', import.meta.url));
await mkdir(fileURLToPath(new URL('../extension/vendor/', import.meta.url)), { recursive: true });
await copyFile(source, target);
console.log('Vendored Mozilla Readability for the Chrome extension.');
