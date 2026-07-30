---
name: ship
description: >-
  Take a feature or fix all the way from idea to released-and-verified, adapting to
  whatever project you're in. A SINGLE command that auto-detects the current stage
  (new idea / scoping / implementing / ready-to-PR / merged / releasing) and continues,
  stopping only at five consequential gates. Bakes in the ship-it guardrails: test
  before merge, plain-English PRs/issues/release-notes, schema changes via the project's
  tool (never hand-DDL), version+lockfile mirroring, deploy handled by CI (then verified),
  and prod touched only through process. Use when the user says "ship", "let's ship this",
  "ship a feature/fix", or wants the end-to-end lifecycle. NOT for a one-off edit with no
  lifecycle. Portable: it reads THIS project's conventions rather than assuming any one stack.
---

# Ship — end-to-end feature/fix lifecycle

A single `/ship` that auto-detects where the work is and continues. It is **project-agnostic**:
it adapts to the repo you're in and never hardcodes another project's specifics.

## STEP 0 — Adapt to THIS project (always do this first)

Read the project's own conventions before acting; treat these as the source of truth:
- **`CLAUDE.md`** (root + nested) — test commands, which env file is for tests vs real data,
  deploy target/playbook, version & release rules, git workflow, and any hard guardrails.
- **The ops/deploy runbook** (`docs/DEPLOYMENT.md`, `docs/deployment.md`, a `runbooks/` dir…) — how to
  reach production: SSH/exec into a container, read logs, redeploy, and **run a migration**. Read this
  BEFORE improvising any prod procedure, not after the third failed attempt. If it is missing or wrong,
  fixing it is part of the work.
- **`package.json` scripts** — how this project tests / type-checks / builds / migrates / releases.
- **CI config** (`.github/workflows/*` or equivalent) — what runs on push and on tag. **This is
  the deployment mechanism.** Your job is to reach a clean merge and then *verify* what CI does —
  not to hand-run deploy steps CI already owns.
- **Existing issue/branch/tag conventions** — mirror them.

Deployment must be **(a) best-practice, (b) a known pattern, (c) appropriate to the project's type
and structure.** When something isn't documented, ask rather than invent.

### STEP 0b — Inventory the SHIPPABLE ARTIFACTS (a repo often ships more than one thing)

Before you touch anything, list what this repo actually ships and **how each one reaches users**.
They rarely reach users the same way:

| Artifact kind | Typically reaches users by | Merging to the default branch… |
|---|---|---|
| Continuously-deployed service (server, web app, API) | CI deploys on push to the default branch | **ships it** |
| Versioned distributable (desktop app, mobile app, CLI binary, library/package, container image) | a **version tag** → CI builds/signs → release → **distribution channel** | **does NOT ship it** |

Derive this from the project's own CI, not from assumptions: a pipeline triggered by a push to the
default branch is the deploy path; a pipeline triggered by a **tag** is the release path. Note each
distributable's **distribution channel** — whatever a user's copy actually consults to get a new
version (an auto-update manifest, an app store, a package registry, a downloads page).

If a repo has only continuously-deployed artifacts, this step costs one glance and Stage 10 is a
no-op. Record the answer — Stage 10 depends on it.

## Auto-detect the stage, then continue

- No definition yet → **Discover**.
- A scoping doc exists but scope isn't locked → keep **iterating the doc**.
- Scope locked, no issue/branch → **Issue → branch**.
- Branch with work in progress → **Implement (TDD)**.
- Tests green + UAT done, no PR → **PR**.
- PR open/approved → **Merge → verify deploy**.
- Merged, and the diff touched a **packaged client app** → **Release is REQUIRED** (its users have
  nothing yet) → **Release → verify feed + downloads**.
- Merged, release pending → **Release → verify**.

## The FIVE hard stops (get explicit approval; run autonomously between them)

1. **Scope-lock** — before creating the issue + branch.
2. **Pre-PR** — before opening the PR (all gates green + user's manual UAT passed).
3. **Pre-merge** — before merging.
4. **Pre-release** — before tagging/releasing.
5. **Prod-migration** — before ANY production schema/data change.

## Stages

### 1 · Discover
Iterate conversationally to define the feature/fix. For every architecture/UX decision, present
options and let the user choose — never decide alone.

### 2 · Scoping doc
Write a temporary planning doc where the project keeps them (e.g. `docs/plans/<FEATURE>.md`).
Capture: capabilities in **plain English**, constraints, files likely touched, test strategy, and
**schema / env-var impact**. Keep it in sync with reality as the approach changes during work.

### 3 · Structured planning (features) vs light path (fixes)
- **Substantial feature** → if the project or environment provides a structured planning workflow
  (a phased-planning system, an RFC or design-doc process, a requirements template), use it, so the
  work is documented as a unit of planned work rather than only as a diff.
- **Small fix** → skip it. The scoping doc + issue + PR + commits ARE the documentation; the
  release-notes mining in stage 11 recovers feature history from PRs/commits either way.

### 4 · Lock scope → issue  ⟨STOP 1: scope-lock⟩
Create the issue: **plain-English description + capabilities first**, THEN the specific
changes/files, acceptance criteria, and testing. Out-of-scope discoveries → **spin-off issues**,
never scope creep.

### 5 · Feature branch
Branch from the default branch (`feature/<name>` or `fix/<name>`). **NEVER work on the default branch.**

### 6 · Implement (TDD)
Red → green → refactor.
- Tests run against the project's **TEST env, never the real-data/dev env.**
- Exercise **real code paths / the real API** — no mocks of the thing under test, no ad-hoc scripts
  to fabricate data, no storage shortcuts. Create test subjects through the real API.
- Schema changes go through the project's schema tool (e.g. `db:push`) — **NEVER hand-written DDL.**
- Update docs during implementation, not after.

### 7 · Green gate  ⟨STOP 2: pre-PR⟩
Every project gate green: typecheck + unit + e2e + build (+ version-mirror / lockfile parity if the
project has them). THEN the user's **manual UAT passes** — code shipped ≠ validated. Only then proceed.

### 8 · Push + 9 · PR  ⟨STOP 3: pre-merge⟩

**Before you merge, answer two questions out loud:**
1. **Does this diff change the schema definition?** If yes → a production migration is part of shipping
   it (10a). Plan it now; do not discover it after the deploy 500s.
2. **Are there un-run migrations already pending from an EARLIER merge?** If deploys have been failing,
   un-run migrations pile up invisibly — and *your* merge, by fixing the pipeline, is what ships that
   code onto the old schema and takes prod down. Check before you unblock a broken deploy.

**Commit in logical, atomic commits grouped by concern** — e.g. core logic/API, UI, tests,
docs+version — never one squashed blob. Each commit builds and tells one part of the story; the
grouping follows the change, not a fixed count. Use semantic prefixes (feat/fix/test/docs/…).
Push the branch. Open the PR in **plain English**:
- **Fix** → briefly the previous problem, then the solution.
- **Feature** → an overview of what it is + its capabilities.
No function/endpoint/column names in the bullet headlines (technical detail goes in a footnote).
Then a short changes list, runnable testing commands, and deploy/DB/env notes.

**Carry the issue's plain-English SCOPE into the PR.** The PR is not just a changelog — a reviewer
should be able to read it alone and understand *what problem this solves and why this solution*,
without opening the issue. So **in addition to** the usual "New feature" / "Fix" sections, restate
(don't just link) the issue's plain-English framing:
- **the problem** — what's wrong today, in user terms;
- **the solution** — what we're doing about it, and the reasoning behind the approach;
- **any obstacle or constraint that shaped the design** — the non-obvious thing that made the
  simple version not work;
- **what is explicitly NOT changing** — often the fastest way to make a reviewer comfortable.

Reuse the issue's own wording where it's already good. A linked issue is a convenience, not a
substitute — PRs get reviewed in isolation and read later as history.

### 10 · Merge → CI deploys → verify  ⟨STOP: prod-migration if schema/data changes⟩
Merge (per project convention) → git cleanup (delete remote+local branch, sync + prune the default
branch). **CI takes over deployment — do not hand-run what CI owns.** Then **verify** the deploy
landed (new version live / health OK).

#### 10a · The migration gate — check it BEFORE you merge, not after

Most pipelines deploy code but **do NOT run migrations**. So shipping code that reads a new column
onto a database that doesn't have it takes production down the instant the deploy lands — the new
code is live, the schema is old, every endpoint touching it 500s.

**Before merging, ask: does this diff change the schema definition?** (Whatever the project's source
of truth is — an ORM schema file, a migrations dir, a model.) If yes, then the migration is **part of
shipping it**, and you plan it now:

- Confirm whether the deploy pipeline runs migrations. Usually it does not. Read the CI config.
- Decide the order (migrate-then-deploy is the safe default for additive changes).
- Treat it as ⟨STOP 5⟩ — the user approves before anything touches prod.

The subtle killer: **a broken or stalled deploy hides a missing migration.** The code never reached
prod, so nothing 500s, and the pending migration looks fine. Then someone fixes the deploy — and *that*
merge is what takes prod down, blaming the wrong change. If deploys have been failing, **check for
un-run migrations before you fix the pipeline.**

#### 10b · Running the migration when the database is not reachable from a laptop

Production datastores are usually internal-only. Do **not** improvise a route to them. In order:

1. **Read the project's ops runbook first** (STEP 0). If it documents the procedure, follow it. If it
   documents a procedure that turns out to be *wrong*, fix the doc in the same pass — a stale runbook
   is worse than none.
2. **Use the project's sanctioned migration tool** (e.g. `db:push`, `migrate up`). **NEVER hand-author
   DDL** and pipe it into a database client — that is not a migration, even when the statements happen
   to be correct. It bypasses the source of truth and drifts every environment.
3. **Get the tool to where the database is**, rather than the database to where you are. Options, in
   order of preference:
   - **Run the tool inside a deployed container/host that is already on the private network.** This is
     usually the right answer and is often already provisioned: the app container typically has the
     schema, the migration tool in its dependencies, and the DB credentials in its environment.
   - A tunnel/port-forward (`ssh -L`, `kubectl port-forward`, a bastion) — **only if the platform
     actually supports it.** Verify, don't assume: some managed hosts refuse forwarding outright
     (e.g. `open failed: unknown channel type`), and no amount of retrying fixes that.
   - A platform-native one-off task/console, if the host offers one.
4. **Preview the diff before applying it.** Tools that reconcile the whole schema can propose
   *destructive* changes if prod has drifted. Run the dry/strict mode, read the statements, and
   **abort on any drop or type change** — that is drift, and it needs a decision, not a push.
5. **Verify against the database afterwards**, then verify the endpoint that was broken actually
   recovers.

Finally: note that migrations belong **in the deploy pipeline**. Every time you run one by hand, say so
and recommend folding it in — hand-run migrations are exactly how this failure recurs.

**Merging ships only the artifacts CI deploys from the default branch (STEP 0b).** Now ask the
question that decides whether you're actually done:

> **Did this change touch a versioned distributable?**

Check the merged diff against each distributable's source tree — including **shared code it consumes**,
which is the easy one to miss. If **yes**, the work is **NOT shipped**: its users are still running the
previously released version and will stay there until a tagged release goes out. **Stage 11 becomes
mandatory, not optional.** Say that plainly instead of reporting "merged ✅" as though the feature had
reached anyone.

If the change only touched continuously-deployed artifacts, verify the deploy and you're done.

### 11 · Release  ⟨STOP 4: pre-release — approval to CUT the release, not to publish it⟩
Releases are typically **batched, not per-merge** (signed builds / notarization are expensive) — cut
one when the user is ready and has validated.
- Bump version per project rules — **mirror ALL package files, including the lockfile,** in one commit;
  tag == versions. Verify the CI install (`npm ci`, etc.) is satisfied first.
- **Release notes in plain English** — what's new / what's fixed, product-level, so a user (or the user
  themself) understands it. **Mine merged PRs + commits since the last release** to assemble them; this
  is also how feature history is recovered when no structured planning doc exists. Maintain the changelog.

#### The tag is the trigger — CI owns the release artifact
Push the **annotated** tag (pipelines often use its message as the release body). CI then builds,
signs, and **creates the release entry itself**, choosing the channel from the tag shape (stable vs
prerelease).

> ⛔ **NEVER hand-create a release entry that CI owns** — not via the forge's CLI, not by clicking
> "New Release". Two things break at once:
> 1. It **bypasses the project's publish gate** — pipelines commonly create a *draft* for a stable tag
>    so a human can check the artifacts before any user gets them.
> 2. A release that exists with **zero assets** can still become the public *"latest"* — so already-
>    installed clients polling the distribution channel resolve a version with **no manifest/artifact**,
>    and their update check breaks until the build finishes uploading.
>
> If you already created one: **revert it to a draft/unpublished state immediately**, then confirm the
> channel a real client reads still resolves the previous good version, intact.

#### Then, in order
1. **Watch the release pipeline to green** — build, sign/notarize, and per-platform smoke. Signing and
   notarization steps can legitimately take a long time; don't mistake slow for hung.
2. **Inspect the produced artifacts** — for EVERY target platform: the installable artifact AND
   whatever the distribution channel needs to serve it (manifest / index / checksums). A missing
   manifest is a channel that cannot serve, even though the build was green.
3. **Publish it.** Publishing, not building, is what releases it to users — so a green build that
   sits as an unpublished draft has shipped NOTHING. Publish the release yourself as part of the ship
   (e.g. `gh release edit vX.Y.Z --draft=false --latest`), then verify the channel below. Do **not**
   hand the draft back and call the work done; do **not** list "publish the release" as a remaining
   step for the user. The one thing you still never do is hand-CREATE a release entry that CI owns
   (see the prohibition above) — publishing a draft CI already built is not that.
   *(If a project genuinely requires a human publish gate, it will say so in its own docs — honour it
   there, and say plainly that the release is built but unpublished. Absent that, publish.)*
4. **Verify the channel, not just the build.** Resolve the new version the way a *client* does — hit
   the public endpoint an installed copy would poll — and confirm it returns the new version with a
   usable artifact per platform. Green CI proves it built; only the channel proves users can get it.
5. **Verify every download path a user could take** — e.g. a downloads/install page must offer the new
   version for every OS/arch it advertises. Check each one, not just the platform you happen to be on.

## What "shipped" means (state this before claiming done)

A change is shipped when **the people it affects can actually get it** — which differs per artifact:

- **Continuously-deployed artifact** → merged + the deploy verified live.
- **Versioned distributable** → merged **AND** released **AND** the distribution channel resolves the
  new version **AND** every advertised download path offers it.

"Merged" is a *milestone*, not the finish line. Reporting a distributable's feature as done at merge
time tells the user their users have it when they demonstrably don't.

## Universal guardrails (enforced every run)

- Never work on the default branch; branch first.
- **Merged ≠ shipped for a versioned distributable.** If the diff touched one (or shared code it
  consumes), a release is REQUIRED — never close out at merge. The merge and the release are ONE
  task: the moment such a PR merges, the NEXT action is the version bump + tag, not a status report.
  Catching yourself writing "a release is still needed" means you have already broken this.
- **A built draft is not a shipped release.** Publish it and verify the distribution channel serves
  the new version. Reporting "the draft is ready, publishing is yours" is stopping one step short.
- **Never hand-create a release entry that CI owns**, and never leave a published release with no
  artifacts — it can hijack "latest" and break existing clients' update checks.
- Tests in the project's TEST env only; real API/code paths, no mocks/shortcuts/ad-hoc data scripts.
- Schema via the project's tool; **NEVER hand-author DDL — least of all on prod.** Preview the diff and
  **abort on any drop or type change** (that's drift — it needs a decision, not a push).
- **A schema change is not shipped until the migration has run on prod.** The pipeline almost certainly
  won't run it for you. And a failing deploy HIDES a pending migration — so before you fix a broken
  pipeline, check what un-run migrations that fix is about to unleash.
- **Read the ops runbook before improvising any prod procedure.** Don't assume a tunnel/port-forward is
  possible — verify. Prefer running the tool inside a container already on the private network.
- Version bump = mirror ALL package files (incl. lockfile) in the same commit; confirm CI's install step
  is satisfied before merge.
- PRs / issues / release notes in **plain English**; no code identifiers in the headlines.
- Nothing merges or releases until tests are green AND the user's manual validation passes.
- New env vars → enumerate them for the user to add via their platform's UI (envs are often
  full-replacement).
- **Never touch production outside this process.**
- Present options for architecture/UX; the user decides.

## Deploy/verify happens through CI, not by hand
The skill's responsibility ends at "merge cleanly + verify." It does not manually run deploy commands
that CI owns. Where the project's CI does not yet cover a needed step (e.g. prod migrations), handle it
at the matching hard-stop with the sanctioned tool, and recommend folding it into CI as the durable pattern.
