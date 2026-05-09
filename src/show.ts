import { open, prompt } from 'glimpseui';
import { injectSubmitBridge } from './form-bridge.js';
import { readRenderableDocument, windowOptions } from './shared.js';
import type { ShowCommandOptions } from './types.js';

export async function show(file: string | undefined, options: ShowCommandOptions): Promise<void> {
  const html = await readRenderableDocument(file);

  if (!options.formSubmit) {
    const win = open(html, windowOptions(options));
    win.on('message', (data: unknown) => console.log(JSON.stringify(data)));
    win.on('closed', () => process.exit(0));
    return;
  }

  const result = await prompt(injectSubmitBridge(html), {
    ...windowOptions(options),
    autoClose: true,
  });

  console.log(JSON.stringify(result ?? { type: 'closed', data: null }));
}
