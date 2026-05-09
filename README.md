# Glimpse Review CLI

[![npm version](https://img.shields.io/npm/v/glimpse-review.svg)](https://www.npmjs.com/package/glimpse-review)
[![license](https://img.shields.io/npm/l/glimpse-review.svg)](./LICENSE)

A small TypeScript CLI built on top of [`glimpseui`](https://github.com/HazAT/glimpse).

The goal is to make agent/user interaction more contextual and lightweight. An agent can open a generated HTML explainer, review document, approval form, or small custom UI in a native Glimpse window, then receive structured feedback from the user without leaving the command flow.

It supports a few related workflows:

- open HTML or Markdown in a lightweight GUI
- let the agent create an HTML form that the user can fill out and submit back
- keep a review window open while the user and agent discuss a document
- let the user select text and send contextual comments
- let the agent highlight specific elements and attach annotations for open questions
- live-reload file-backed review pages when the source changes
- avoid auto-refreshing while the user has dirty form input

## Install

```bash
npm install -g glimpse-review
```

Requires Node.js 20+.

For working on the CLI itself, see [Development](#development).

## Agent Skill

This package bundles an agent skill that documents when an agent should use the CLI, the normal review workflow, and how to interpret user feedback messages. Print the installed path with:

```bash
glimpse-review skill-path
```

This resolves correctly from any npm-linked or npm-installed location, so another tool can discover the bundled skill file without assuming the current working directory.

Pairs nicely with [`nicobailon/visual-explainer`](https://github.com/nicobailon/visual-explainer) — generate a rich HTML explainer with that skill, then open and review it through `glimpse-review`.

## Claude Code Plugin

This repo also ships as a [Claude Code plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugins) so the `glimpse-review` skill is available to Claude Code without copying `SKILL.md` by hand.

```text
/plugin marketplace add larryhudson/glimpse-review
/plugin install glimpse-review@glimpse-review
```

Or point at a local checkout:

```text
/plugin marketplace add /path/to/glimpse-review
/plugin install glimpse-review@glimpse-review
```

The plugin only registers the skill — you still need the `glimpse-review` binary on your PATH (`npm install -g glimpse-review`) for the skill's commands to run.

## Commands

```text
show [options] [file]        one-shot HTML/Markdown display, captures form submit
review [options] [file]      persistent review window with comments + annotations
annotate <selector> <text>   attach a floating comment to an element
eval <javascript...>         run JS in the active review shell
skill-path                   print the path to the bundled agent skill
```

`show` and `review` accept `.html` and `.md` file paths.

## Show HTML

Open an HTML file in a Glimpse window:

```bash
glimpse-review show examples/approval-form.html
```

Or pipe HTML:

```bash
cat examples/approval-form.html | glimpse-review show
```

By default, `show` intercepts form submissions. When the user submits a form, the window closes and the process prints JSON:

```json
{
  "type": "form-submit",
  "form": "approval",
  "data": {
    "decision": "approve",
    "notify": "yes",
    "note": "Looks good"
  }
}
```

To disable automatic form handling:

```bash
glimpse-review show --no-form-submit examples/approval-form.html
```

## Review HTML

Open a persistent review window:

```bash
glimpse-review review --width 700 --height 620 --title "Review Demo" examples/approval-form.html
```

`review` opens a stable Preact-based shell and renders the HTML inside an iframe. The shell owns review UI such as comments, annotations, highlights, and refresh controls. The reviewed HTML remains separate from that UI.

When reviewing a file path, the process watches the file for changes.

- If no form fields are dirty, the iframe reloads automatically.
- If the user has edited a form field, reload is paused and a `File changed / Refresh` control appears.
- Clicking `Refresh` applies the pending file content.

Submitting the reviewed page's form sends the user's answers back to the agent and closes the review process.

Pass a `.md` file (e.g. `glimpse-review review README.md`) to render Markdown as HTML on the fly using the same review shell. Piped stdin is treated as raw HTML.

## Annotate

Attach a floating annotation to an element:

```bash
glimpse-review annotate "#note" "Can you explain this choice?"
```

Annotations highlight the selected element, scroll it into view, and place a floating comment next to it. They are positioned with Floating UI and stay aligned across scroll, resize, and layout changes. Multiple `annotate` calls accumulate — each gets its own card with its own reply form, and a `Hide comments` toggle in the corner can dismiss them all.

Annotation boxes include a reply form. Submitting a reply prints JSON but does not close the review window:

```json
{
  "type": "annotation-reply",
  "selector": "#note",
  "annotation": "Can you explain this choice?",
  "reply": "I chose this because...",
  "submittedAt": "2026-05-09T08:38:49.626Z"
}
```

## Selection Comments

In review mode, select text inside the reviewed HTML. A floating `Comment` button appears near the selection.

Click `Comment`, enter feedback, and submit. The review process prints JSON and stays open:

```json
{
  "type": "selection-comment",
  "selectedText": "waiting command",
  "comment": "What is the waiting command?",
  "element": {
    "outerHTML": "<p class=\"text-secondary mb-0\">Choose how the waiting command should continue.</p>"
  },
  "submittedAt": "2026-05-09T08:38:49.626Z"
}
```

The `element.outerHTML` field is the parent element for the selected text. This gives the receiving agent enough context without relying on fragile source line numbers.

## Eval

Run arbitrary JavaScript in the open review shell:

```bash
glimpse-review eval "window.__glimpseReview.annotate('#note', 'Can you explain this choice?')"
```

This is the low-level escape hatch behind `annotate`.

## Development

```bash
git clone https://github.com/larryhudson/glimpse-review.git
cd glimpse-review
npm install
npm run build   # tsc + vite build of the review shell
npm link        # makes glimpse-review available on PATH
```

Other useful commands:

```bash
npm run typecheck
npm run glimpse -- --help                                          # run without linking
npm exec vite -- --config vite.review-shell.config.ts --host 127.0.0.1  # debug the shell in a browser at http://127.0.0.1:5173/
```

In Vite dev mode, the shell stubs `window.glimpse` and loads `examples/approval-form.html` so the UI can be inspected in a normal browser.

## Architecture

The Node CLI (`src/cli.ts` and friends) is intentionally separate from the Preact-based review shell (`src/review-shell/`). The shell is built with Vite into `dist/review-shell`; at runtime, `src/review-shell.ts` inlines the built HTML and JS before handing it to Glimpse. The bundled agent skill lives at `plugins/glimpse-review/skills/glimpse-review/SKILL.md` so it can be served by both the npm package and the Claude Code plugin.
