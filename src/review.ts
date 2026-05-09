import { existsSync, unlinkSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { open } from 'glimpseui';
import { REVIEW_SOCKET } from './review-constants.js';
import { loadReviewShell } from './review-shell.js';
import { errorMessage, hasMessageType, readRenderableDocument, renderDocument, windowOptions } from './shared.js';
import type { EvalRequest, WindowCommandOptions } from './types.js';

export async function review(file: string | undefined, options: WindowCommandOptions): Promise<void> {
  const html = await readRenderableDocument(file);
  const watchedFile = file ? resolve(file) : null;
  const win = open(await loadReviewShell(), windowOptions(options));
  let watcher: FSWatcher | null = null;

  if (existsSync(REVIEW_SOCKET)) unlinkSync(REVIEW_SOCKET);

  const server = createServer((socket) => {
    let body = '';
    socket.setEncoding('utf8');

    socket.on('data', (chunk) => {
      body += chunk;
    });

    socket.on('end', () => {
      try {
        const msg = JSON.parse(body) as Partial<EvalRequest>;
        if (msg.type === 'eval' && typeof msg.js === 'string') {
          win.send(msg.js);
          socket.end(`${JSON.stringify({ ok: true })}\n`);
        } else {
          socket.end(`${JSON.stringify({ ok: false, error: 'Unsupported message' })}\n`);
        }
      } catch (error) {
        socket.end(`${JSON.stringify({ ok: false, error: errorMessage(error) })}\n`);
      }
    });
  });

  server.listen(REVIEW_SOCKET, () => {
    writeFileSync(`${tmpdir()}/glimpse-review.pid`, String(process.pid));
    console.log(`Review window open. Control socket: ${REVIEW_SOCKET}`);
  });

  const setContent = (nextHtml: string): void => {
    win.send(`window.__glimpseReview?.setContent(${JSON.stringify(nextHtml)})`);
  };
  const updateContent = (nextHtml: string): void => {
    win.send(`window.__glimpseReview?.updateContent(${JSON.stringify(nextHtml)})`);
  };

  let contentLoaded = false;
  const loadInitialContent = (): void => {
    if (contentLoaded) return;
    contentLoaded = true;
    setContent(html);

    if (watchedFile) {
      let reloadTimer: NodeJS.Timeout | null = null;
      watcher = watch(watchedFile, () => {
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(async () => {
          try {
            updateContent(renderDocument(await readFile(watchedFile, 'utf8'), watchedFile));
          } catch (error) {
            console.error(`Failed to reload ${watchedFile}: ${errorMessage(error)}`);
          }
        }, 80);
      });
    }
  };

  win.on('message', (data: unknown) => {
    console.log(JSON.stringify(data));
    if (hasMessageType(data, 'review-ready')) {
      loadInitialContent();
    } else if (!hasMessageType(data, 'annotation-reply') && !hasMessageType(data, 'selection-comment')) {
      win.close();
    }
  });

  await new Promise<void>((resolveReview) => {
    win.on('closed', () => {
      watcher?.close();
      server.close();
      if (existsSync(REVIEW_SOCKET)) unlinkSync(REVIEW_SOCKET);
      resolveReview();
    });
  });
}
