---
name: glimpse-review
description: Use the Glimpse Review CLI to open lightweight HTML or Markdown review windows, collect user form input, add annotations, and receive contextual comments from the user. Use when an agent needs a small GUI for explanation, approval, feedback, or document review.
---
# Glimpse Review

Glimpse Review is a CLI for opening contextual HTML or Markdown in a native Glimpse window. Use it when a normal terminal prompt is too limited and the user would benefit from a lightweight visual UI, review page, form, or explainer.

The CLI binary is `glimpse-review`.

## Workflow

    1. Start glimpse-review review <file.html|file.md> as a background/long-running tool session
    2. Keep the returned session id so you can poll the process output for comments
    3. glimpse-review annotate <selector> "<question>"        # point at a specific element and ask a question
    4. Wait for selection comments or annotation replies       # poll the running review session output
    5. Edit the source file if the user asks for changes        # review window live-reloads file-backed content
    6. Continue the discussion until the review is resolved

For one-shot form prompts:

    1. Generate an HTML form
    2. glimpse-review show <form.html>
    3. Wait for the form submission JSON
    4. Continue based on the user's answers

## Commands

### Review

    glimpse-review review [options] [file]

Use `review` for collaborative discussion. It opens a persistent review shell and renders the supplied HTML or `.md` file inside an iframe.

Run `review` as a background/long-running tool session, not as a foreground command that blocks the conversation. The command stays alive so it can print JSON messages for selection comments and annotation replies. If the foreground command is interrupted, you may lose the process handle and no longer be able to read the user's submitted comments.

Common options:

    --width <n>       window width
    --height <n>      window height
    --title <text>    window title

Examples:

    glimpse-review review README.md
    glimpse-review review --width 760 --height 720 --title "README Review" README.md
    glimpse-review review examples/approval-form.html

When reviewing a file path, Glimpse Review watches the file and refreshes the window after edits. If the user has dirty form input, the window does not auto-refresh; it shows a refresh control instead.

### Annotate

    glimpse-review annotate <selector> <text...>

Use `annotate` when you want to draw the user's attention to a specific part of the reviewed document. The command highlights the matching element, scrolls it into view, and attaches a floating comment box.

Examples:

    glimpse-review annotate "h2:nth-of-type(2)" "Should this section move earlier?"
    glimpse-review annotate "#approval-note" "Can you confirm this wording?"

Multiple `annotate` calls accumulate, so you can drop several questions on the same review page in one pass and the user will see them all at once.

Prefer `annotate` over raw JavaScript when the goal is simply to ask about one element.

### Show

    glimpse-review show [options] [file]

Use `show` for a one-shot prompt, especially when the agent creates an HTML form for the user to fill out. By default, submitting a form closes the window and prints JSON to stdout.

Example:

    glimpse-review show examples/approval-form.html

Disable automatic form handling only when you need to receive custom `window.glimpse.send(...)` messages:

    glimpse-review show --no-form-submit custom.html

### Eval

    glimpse-review eval <javascript...>

Use `eval` as a low-level escape hatch for the active review shell. Prefer `annotate` for normal review comments.

Example:

    glimpse-review eval "window.__glimpseReview.annotate('#note', 'Can you explain this?')"

### Skill Path

    glimpse-review skill-path

Prints the absolute path to this `SKILL.md` file. Use this when another tool needs to install or reference the skill from an npm-installed package.

## Receiving User Input

The running `review` or `show` process prints JSON messages to stdout. For `review`, keep the background session id and poll that process output after the user says they submitted feedback. Do not assume comments are available anywhere else if the review process was interrupted or replaced.

Selection comments look like:

    {
      "type": "selection-comment",
      "selectedText": "waiting command",
      "comment": "What does this mean?",
      "element": {
        "outerHTML": "<p>Choose how the waiting command should continue.</p>"
      },
      "submittedAt": "2026-05-09T08:38:49.626Z"
    }

Annotation replies look like:

    {
      "type": "annotation-reply",
      "selector": "#note",
      "annotation": "Can you explain this choice?",
      "reply": "I chose this because...",
      "submittedAt": "2026-05-09T08:38:49.626Z"
    }

Form submissions look like:

    {
      "type": "form-submit",
      "form": "approval",
      "data": {
        "decision": "approve",
        "note": "Looks good"
      }
    }

In review mode, selection comments and annotation replies do not close the window. A reviewed page form submission closes the review process.

## Authoring HTML For Users

Keep generated HTML practical and focused. Good uses include:

  * approval forms
  * option pickers
  * short explainers with diagrams or tables
  * document review pages
  * checklists and structured feedback forms

Use ordinary semantic HTML. Add labels to form fields. Give important elements stable IDs when you may want to annotate them later.

Example:

    <section id="tradeoff">
      <h2>Tradeoff</h2>
      <p>This approach keeps the CLI small but requires a build step.</p>
    </section>

Then annotate it:

    glimpse-review annotate "#tradeoff" "Is this the right tradeoff?"

## Markdown

`review` and `show` accept `.md` paths and convert them to HTML on the fly. Piped stdin is treated as raw HTML.

Use Markdown review for existing docs. Use HTML when you need forms, richer layout, or stable selectors for annotations.

## Common Errors

  * "No HTML or Markdown provided" -- pass a file path or pipe HTML into stdin.
  * Connection refused for `annotate` or `eval` -- start a `glimpse-review review ...` process first.
  * Annotation selector does nothing -- check that the selector matches an element inside the reviewed iframe.
  * File changes do not appear immediately -- the user may have dirty form input; ask them to click the refresh control.
