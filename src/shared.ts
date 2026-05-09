import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { marked } from 'marked';
import type { GlimpseWindowOptions } from 'glimpseui';
import type { WindowCommandOptions } from './types.js';

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readHtml(file?: string): Promise<string> {
  return readRenderableDocument(file);
}

export async function readRenderableDocument(file?: string): Promise<string> {
  if (file) {
    const path = resolve(file);
    return renderDocument(await readFile(path, 'utf8'), path);
  }

  if (!process.stdin.isTTY) {
    return readStdin();
  }

  throw new Error('No HTML or Markdown provided. Pass a file or pipe HTML into stdin.');
}

export function renderDocument(source: string, file?: string): string {
  if (file && isMarkdownPath(file)) {
    return markdownToHtml(source, file);
  }

  return source;
}

export function isMarkdownPath(file: string): boolean {
  const ext = extname(file).toLowerCase();
  return ext === '.md';
}

function markdownToHtml(markdown: string, file: string): string {
  const body = marked.parse(markdown, {
    async: false,
    gfm: true,
    breaks: false,
  });
  const title = escapeHtml(file.split('/').pop() ?? 'Markdown');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      :root {
        color: #1f2937;
        background: #f8fafc;
        font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
      }

      body {
        margin: 0;
        background: #f8fafc;
      }

      main {
        width: min(760px, calc(100% - 40px));
        margin: 0 auto;
        padding: 40px 0 56px;
      }

      h1, h2, h3, h4 {
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.15;
      }

      h1 {
        margin-top: 0;
        font-size: 2.1rem;
      }

      p, li {
        font-size: 1.05rem;
        line-height: 1.65;
      }

      code {
        padding: 0.12em 0.3em;
        border-radius: 4px;
        background: #e5e7eb;
        font-size: 0.9em;
      }

      pre {
        overflow: auto;
        padding: 14px 16px;
        border-radius: 8px;
        background: #111827;
        color: #f9fafb;
      }

      pre code {
        padding: 0;
        background: transparent;
        color: inherit;
      }

      blockquote {
        margin-left: 0;
        padding-left: 16px;
        border-left: 4px solid #94a3b8;
        color: #475569;
      }

      img {
        max-width: 100%;
      }
    </style>
  </head>
  <body>
    <main data-source-type="markdown" data-source-file="${escapeHtml(file)}">
      ${body}
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function windowOptions(options: WindowCommandOptions): GlimpseWindowOptions {
  return {
    width: options.width,
    height: options.height,
    title: options.title,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function hasMessageType(data: unknown, type: string): boolean {
  return Boolean(
    data &&
      typeof data === 'object' &&
      'type' in data &&
      (data as { type?: unknown }).type === type
  );
}
