import { createConnection } from 'node:net';
import { REVIEW_SOCKET } from './review-constants.js';
import type { EvalRequest } from './types.js';

function isConnectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code !== undefined &&
    ['ENOENT', 'ECONNREFUSED'].includes((error as NodeJS.ErrnoException).code ?? '')
  );
}

export async function evalInReview(js: string): Promise<void> {
  if (!js.trim()) throw new Error('No JavaScript provided.');

  let response: string;
  try {
    response = await new Promise<string>((resolveResponse, rejectResponse) => {
      const socket = createConnection(REVIEW_SOCKET);
      let body = '';

      socket.setEncoding('utf8');
      socket.on('connect', () => {
        socket.end(JSON.stringify({ type: 'eval', js } satisfies EvalRequest));
      });
      socket.on('data', (chunk) => {
        body += chunk;
      });
      socket.on('end', () => {
        resolveResponse(body);
      });
      socket.on('error', (error) => {
        rejectResponse(error);
      });
    });
  } catch (error) {
    if (isConnectionError(error)) {
      throw new Error(
        `No active review window found. Start one first with "glimpse-review review <file>".`
      );
    }
    throw error;
  }

  console.log(response.trim());
}

export async function annotateInReview(selector: string, text: string): Promise<void> {
  if (!selector.trim()) throw new Error('No CSS selector provided.');
  if (!text.trim()) throw new Error('No annotation text provided.');

  await evalInReview(
    `window.__glimpseReview?.annotate(${JSON.stringify(selector)}, ${JSON.stringify(text)})`
  );
}
