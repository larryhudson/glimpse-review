#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander';
import { fileURLToPath } from 'node:url';
import { annotateInReview, evalInReview } from './review-client.js';
import { review } from './review.js';
import { errorMessage } from './shared.js';
import { show } from './show.js';
import type { ShowCommandOptions, WindowCommandOptions } from './types.js';

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InvalidArgumentError('must be a number');
  }
  return parsed;
}

function addWindowOptions(command: Command): Command {
  return command
    .option('--width <n>', 'window width', parseNumber, 520)
    .option('--height <n>', 'window height', parseNumber, 420)
    .option('--title <text>', 'window title', 'Glimpse');
}

function skillPath(): string {
  return fileURLToPath(new URL('../plugins/glimpse-review/skills/glimpse-review/SKILL.md', import.meta.url));
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('glimpse-review')
    .description('Small Glimpse helpers for showing HTML, form prompts, and review annotations');

  addWindowOptions(program.command('show [file]'))
    .description('show HTML or Markdown from a file or stdin; form submit prints JSON and closes by default')
    .option('--no-form-submit', 'do not auto-resolve on form submit')
    .action((file: string | undefined, options: ShowCommandOptions) => show(file, options));

  addWindowOptions(program.command('review [file]'))
    .description('open a persistent review window with a local eval/annotation control socket')
    .action((file: string | undefined, options: WindowCommandOptions) => review(file, options));

  program
    .command('eval <javascript...>')
    .description('evaluate JavaScript in the current review window')
    .action((parts: string[]) => evalInReview(parts.join(' ')));

  program
    .command('annotate <selector> <text...>')
    .description('highlight a CSS selector and place a floating annotation next to it')
    .action((selector: string, parts: string[]) => annotateInReview(selector, parts.join(' ')));

  program
    .command('skill-path')
    .description('print the absolute path to the bundled Glimpse Review agent skill')
    .action(() => {
      console.log(skillPath());
    });

  await program.parseAsync(process.argv);
}

try {
  await main();
} catch (error) {
  console.error(errorMessage(error));
  process.exit(1);
}
