import { tmpdir } from 'node:os';

export const REVIEW_SOCKET = `${tmpdir()}/glimpse-review.sock`;
