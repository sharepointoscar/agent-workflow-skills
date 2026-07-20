# Agent Workflow Skills

Two [Claude Code](https://code.claude.com) skills for building software: one that takes a change from
idea to released-and-verified, and one that settles the design visually before any code gets written.

Both are **project-agnostic**. They read the conventions of whatever repo you're in — test commands,
deploy pipeline, release rules, design tokens — rather than assuming a stack. Nothing about them is
specific to the projects they grew out of.

## What's in here

| Plugin | What it does | Requires |
|---|---|---|
| **ship** | Runs the whole lifecycle — discover, scope, issue, branch, TDD, PR, merge, migrate, release, verify — stopping at five consequential gates for your approval. | nothing |
| **design-mockup** | Generates on-brand UI mockups from your project's real design tokens, looks at every screenshot to check brand fidelity, and presents a review gallery before implementation. | [Stitch](https://stitch.withgoogle.com) MCP server |

### ship

A single `/ship` that auto-detects where the work already is and continues from there. The value isn't
the happy path — it's the failure modes baked in as guardrails:

- **Merged ≠ shipped.** For a versioned distributable (desktop app, CLI, library), merging ships
  nothing; users stay on the old version until a tagged release goes out and the distribution channel
  actually resolves it.
- **A built draft is not a released one.** Publishing, not building, is what reaches users.
- **A broken deploy hides a pending migration.** Un-run migrations pile up invisibly while deploys
  fail — then the merge that *fixes* the pipeline is what takes production down, blaming the wrong
  change.
- **Never hand-author DDL.** Schema changes go through the project's own tool, previewed first, and
  abort on any drop or type change.
- **Get the migration tool to the database**, not the database to your laptop — and verify a tunnel is
  even possible before assuming it.

It stops for you at five points: scope-lock, pre-PR, pre-merge, pre-release, and any production
migration. Between those it runs on its own.

### design-mockup

Mockup-first: decide and approve the design visually before implementation. It finds your project's
actual design source of truth (a style guide, design tokens, a Tailwind/theme config, a live design
system page), extracts the real hex values rather than inventing a brand, generates one screen to
verify, then batches the rest. Every screenshot is downloaded and actually viewed — a wrong-looking
screen is something no test suite can catch.

## Install

Add the marketplace, then install whichever plugins you want:

```
/plugin marketplace add sharepointoscar/agent-workflow-skills
/plugin install ship@agent-workflow-skills --scope user
/plugin install design-mockup@agent-workflow-skills --scope user
```

`--scope user` makes them available in every project on that machine. Drop it to install per-project
instead.

To pull later changes:

```
/plugin marketplace update agent-workflow-skills
```

Auto-update is off by default for third-party marketplaces — turn it on per machine under `/plugin` →
Marketplaces if you'd rather not update by hand.

## Using them across machines

Install on each machine with the same two commands above. The marketplace is the sync mechanism:
edit a skill here, commit, push, and `/plugin marketplace update` on your other machines.

## License

MIT
