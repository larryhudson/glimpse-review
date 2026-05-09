import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadReviewShell(): Promise<string> {
  const [html, js] = await Promise.all([
    readFile(join(__dirname, 'review-shell', 'index.html'), 'utf8'),
    readFile(join(__dirname, 'review-shell', 'review-shell.js'), 'utf8'),
  ]);

  return html.replace(
    /<script[^>]+src=["']\.\/review-shell\.js["'][^>]*><\/script>/,
    `<script type="module">\n${js}\n</script>`
  );
}
