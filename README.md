# Glimpse Review CLI

A small TypeScript CLI experiment built on top of [`glimpseui`](https://github.com/HazAT/glimpse).

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

This installs the `glimpse-review` binary globally. Requires Node.js 20+.

To install from source for development:

```bash
git clone https://github.com/larryhudson/glimpse-review.git
cd glimpse-review
npm install
npm run build
npm link
```

`npm run build` compiles the Node CLI with TypeScript and bundles the review shell with Vite. `npm link` makes the local `glimpse-review` binary available on your PATH.

## Commands

```bash
glimpse-review --help
```

Available commands:

```text
show [options] [file]
review [options] [file]
eval <javascript...>
annotate <selector> <text...>
skill-path
```

`show` and `review` accept `.html` and `.md` file paths:

```text
show [options] [file.md]
review [options] [file.md]
```

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

## Review Markdown

Pass a `.md` file to render it as HTML on the fly:

```bash
glimpse-review review README.md
```

Markdown files use the same review shell as HTML files, so highlighting, annotations, selection comments, live reload, and dirty-form refresh behavior all work the same way. The conversion is path-based; piped stdin is currently treated as raw HTML.

## Annotate

Attach a floating annotation to an element:

```bash
glimpse-review annotate "#note" "Can you explain this choice?"
```

Annotations highlight the selected element, scroll it into view, and place a floating comment next to it. They are positioned with Floating UI and stay aligned across scroll, resize, and layout changes.

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

## Agent Skill

This package includes an agent skill at `skills/glimpse-review/SKILL.md`. The skill documents when an agent should use the CLI, the normal review workflow, and how to interpret user feedback messages.

Print the installed skill path:

```bash
glimpse-review skill-path
```

This works from an npm-linked or npm-installed package, so another tool can discover the bundled skill file without assuming the current working directory.

## Development

Type-check:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Link the binary locally:

```bash
npm link
glimpse-review --help
```

Or run it without linking:

```bash
npm run glimpse -- --help
```

Run the review shell in a browser for debugging:

```bash
npm exec vite -- --config vite.review-shell.config.ts --host 127.0.0.1
```

Then open:

```text
http://127.0.0.1:5173/
```

In Vite dev mode, the shell stubs `window.glimpse` and loads `examples/approval-form.html` automatically so the UI can be inspected in a normal browser.

## Architecture

The Node CLI is intentionally separate from the review UI.

Node-side files:

- `src/cli.ts` wires Commander commands.
- `src/show.ts` implements one-shot HTML/form display.
- `src/review.ts` starts the persistent review process, local socket, file watcher, and Glimpse window.
- `src/review-client.ts` sends `eval` and `annotate` commands to the active review window.

Browser shell files:

- `src/review-shell/index.html` is the shell document.
- `src/review-shell/main.tsx` is the Preact review app.
- `src/review-shell/positioning.ts` contains iframe geometry helpers.

Agent skill files:

- `skills/glimpse-review/SKILL.md` documents how agents should use the CLI.

The shell is built with Vite into `dist/review-shell`. At runtime, `src/review-shell.ts` reads the built HTML and JavaScript and inlines the script before sending the shell to Glimpse.

## Notes

This is still a prototype CLI, but it is wired as a Node binary. Run `npm run build` before using `npm link` or `npm run glimpse`.
