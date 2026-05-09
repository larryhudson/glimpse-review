declare module 'glimpseui' {
  import type { EventEmitter } from 'node:events';

  export interface GlimpseInfo {
    screen?: unknown;
    screens?: unknown;
    appearance?: unknown;
    cursor?: unknown;
    cursorTip?: unknown;
  }

  export interface GlimpseWindowOptions {
    width?: number;
    height?: number;
    title?: string;
    x?: number;
    y?: number;
    frameless?: boolean;
    floating?: boolean;
    transparent?: boolean;
    clickThrough?: boolean;
    followCursor?: boolean;
    followMode?: 'snap' | 'spring' | string;
    cursorAnchor?: string;
    cursorOffset?: { x?: number; y?: number };
    openLinks?: boolean;
    openLinksApp?: string;
    hidden?: boolean;
    autoClose?: boolean;
    noDock?: boolean;
    timeout?: number;
  }

  export interface GlimpseWindow extends EventEmitter {
    send(js: string): void;
    setHTML(html: string): void;
    show(options?: { title?: string }): void;
    close(): void;
    loadFile(path: string): void;
    getInfo(): void;
    followCursor(enabled: boolean, anchor?: string, mode?: string): void;
    readonly info: GlimpseInfo | null;
  }

  export function open(html: string, options?: GlimpseWindowOptions): GlimpseWindow;
  export function prompt<T = unknown>(html: string, options?: GlimpseWindowOptions): Promise<T | null>;
}
