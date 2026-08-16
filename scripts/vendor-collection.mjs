#!/usr/bin/env node
/**
 * Vendors the agents and skills from MK-ORGANIZATION-1/AGENTS-COLLECTION into
 * this marketplace as category plugins.
 *
 *   node scripts/vendor-collection.mjs <path-to-AGENTS-COLLECTION-checkout>
 *
 * Nothing upstream is installable as published, so this script is the record of
 * what had to change:
 *
 *   - 68 of the 106 agent files carry a `name` like "Brand Guardian", with
 *     spaces, and some with `/` or `&`. Claude Code hands that field to hooks as
 *     agent_type, so it is rewritten to the file's own stem — unique by
 *     construction, and it keeps the design-/engineering-/marketing- prefixes
 *     that tell the two upstream source collections apart.
 *   - 5 further agent files have no frontmatter at all and cannot load. They get
 *     frontmatter built from their own "## Description" section.
 *   - All 499 skill directories are UPPERCASE, and a plugin takes a skill's
 *     invocation name from its directory name.
 *
 * Everything else is left byte-identical, colours included. The script is
 * idempotent: it deletes and rewrites only the plugins it generates, and never
 * touches plugins/devopsoscar.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = process.argv[2]

if (!SRC || !existsSync(join(SRC, 'AGENTS', 'CLAUDE-CODE'))) {
  console.error('usage: node scripts/vendor-collection.mjs <path-to-AGENTS-COLLECTION-checkout>')
  console.error('       (the path must contain AGENTS/CLAUDE-CODE and SKILLS/CLAUDE-CODE)')
  process.exit(1)
}

const AGENT_SRC = join(SRC, 'AGENTS', 'CLAUDE-CODE')
const SKILL_SRC = join(SRC, 'SKILLS', 'CLAUDE-CODE')
const AUTHOR = { name: 'DevOpsOscar', email: 'me@devopsoscar.dev' }
const VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Agents — every file assigned to exactly one plugin, by hand, so the grouping
// is auditable rather than guessed at. Named files first, prefixes after.
// ---------------------------------------------------------------------------

const AGENT_PLUGINS = [
  {
    name: 'agents-engineering',
    description:
      'Build the thing: backend and frontend architects, AI and data engineers, DevOps, mobile, rapid prototyping, security engineering, and the small single-purpose agents for architecture, codegen, CI, docs and repo scanning.',
    prefixes: ['engineering-'],
    files: [
      'ai-engineer', 'backend-architect', 'devops-automator', 'frontend-developer',
      'mobile-app-builder', 'rapid-prototyper', 'architecture-agent', 'codegen-agent',
      'ci-agent', 'repo-scanner', 'docs-agent', 'analysis-agent',
      'lsp-index-engineer', 'terminal-integration-specialist',
    ],
  },
  {
    name: 'agents-design',
    description:
      'Decide how it looks and holds together: brand guardianship, UI and UX design, UX research and architecture, visual storytelling, image prompting, inclusive visuals, and the whimsy injector.',
    prefixes: ['design-'],
    files: ['brand-guardian', 'ui-designer', 'ux-researcher', 'visual-storyteller', 'whimsy-injector'],
  },
  {
    name: 'agents-marketing',
    description:
      'Take it to market: content creation, growth hacking, app store optimisation, and per-channel specialists for Instagram, TikTok, Twitter/X, Reddit, WeChat, Xiaohongshu and Zhihu.',
    prefixes: ['marketing-'],
    files: [
      'app-store-optimizer', 'tiktok-strategist', 'content-creator', 'growth-hacker',
      'instagram-curator', 'reddit-community-builder', 'twitter-engager',
    ],
  },
  {
    name: 'agents-product',
    description:
      'Decide what to build next: sprint prioritisation, feedback synthesis, trend research, and a behavioural nudge engine.',
    prefixes: ['product-'],
    files: ['feedback-synthesizer', 'sprint-prioritizer', 'trend-researcher'],
  },
  {
    name: 'agents-project-management',
    description:
      'Keep the work moving: experiment tracking, project shepherding, studio operations and production, shipping, senior project management, and an orchestrator that dispatches the other agents.',
    prefixes: ['project-management-'],
    files: [
      'project-manager-senior', 'experiment-tracker', 'studio-producer', 'studio-coach',
      'project-shipper', 'agents-orchestrator',
    ],
  },
  {
    name: 'agents-testing',
    description:
      'Prove it works: API testing, accessibility auditing, performance benchmarking, test writing and fixing, results analysis, evidence collection, tool evaluation, workflow optimisation, and a reality checker.',
    prefixes: ['testing-'],
    files: [
      'api-tester', 'performance-benchmarker', 'test-results-analyzer', 'test-writer-fixer',
      'tool-evaluator', 'workflow-optimizer',
    ],
  },
  {
    name: 'agents-support-ops',
    description:
      'Run it once it is live: support response, analytics and executive reporting, finance tracking, infrastructure maintenance, legal and compliance checks, and data consolidation, extraction and distribution.',
    prefixes: ['support-'],
    files: [
      'analytics-reporter', 'finance-tracker', 'infrastructure-maintainer', 'legal-compliance-checker',
      'data-analytics-reporter', 'data-consolidation-agent', 'report-distribution-agent',
      'sales-data-extraction-agent',
    ],
  },
  {
    name: 'agents-xr-spatial',
    description:
      'Build for headsets and spatial platforms: XR interface architecture, cockpit interaction, immersive development, visionOS, and macOS Metal.',
    prefixes: ['xr-'],
    files: ['visionos-spatial-engineer', 'macos-spatial-metal-engineer'],
  },
  {
    name: 'agents-specialized',
    description:
      'The ones that fit nowhere else: agentic identity and trust architecture, cultural intelligence, developer advocacy, and a joker.',
    prefixes: ['specialized-'],
    files: ['agentic-identity-trust', 'joker'],
  },
]

// ---------------------------------------------------------------------------
// Skills — 499 of them, ~24k tokens of descriptions if they all load at once,
// so they are grouped and installed separately. Rules are ordered; first match
// wins; anything unmatched lands in skills-misc and is reported.
// ---------------------------------------------------------------------------

const SKILL_PLUGINS = [
  {
    name: 'skills-azure-m365',
    description:
      'Microsoft cloud: the Azure SDK skills across .NET, Java, Python, TypeScript and Rust — AI services, storage, messaging, Key Vault, Cosmos, monitoring — plus the M365 agent SDKs.',
    match: /^(azure|m365)-/,
  },
  {
    name: 'skills-cloud-infra',
    description:
      'Everything that runs the thing: AWS and GCP, Kubernetes, Terraform, Helm, Docker, service mesh, observability and Grafana, deployment pipelines, incident response and on-call, networking and server management.',
    match: /^(aws|gcp|kubernetes|terraform|helm|docker|linkerd|service-mesh|observability|grafana|deployment|incident|on-call|server-management|hybrid-cloud|network-engineer|mtls|cost-optimization|database-cloud|vercel|firebase|inngest|upstash|trigger-dev|using-neon|supabase-automation|nextjs-supabase|gitlab-ci|circleci|bazel|monorepo|helm|powershell|busybox|posix-shell|linux-shell|bash-defensive|bats-testing)/,
  },
  {
    name: 'skills-security',
    description:
      'Offensive and defensive security: penetration testing and the tooling around it, web vulnerability classes, privilege escalation, threat modelling and STRIDE, SAST, secrets management, malware and memory forensics, GDPR handling.',
    match: /(pentest|penetration|metasploit|red-team|malware|forensic|privilege-escalation|vulnerabilit|sql-injection|xss|idor|file-path-traversal|broken-authentication|attack-tree|stride|threat-|sast|secrets-management|security|scanning-tools|ffuf|sqlmap|top-web|gdpr|protocol-reverse|active-directory-attacks|clerk-auth|auth-implementation)/,
  },
  {
    name: 'skills-languages',
    description:
      'Language and framework depth: the -pro skills for Go, Rust, Python, TypeScript, C, C++, C#, Ruby, PHP, Scala, Julia and Elixir, plus Django, FastAPI, NestJS, Prisma, Bun, .NET, Unity, Avalonia and the mobile stacks.',
    match: /(-pro$|^(golang|rust|python|typescript|javascript|django|fastapi|nestjs|prisma|bun|dotnet|unity|avalonia|expo|ios-developer|mobile-developer|react-native|threejs|remotion|blockchain|copilot-sdk|agents-v2-py|go-concurrency|memory-safety|fp-ts|uv-package|python-packaging)-?)/,
  },
  {
    name: 'skills-web-frontend',
    description:
      'The browser half: React, Next.js and Angular patterns, state management and modernisation, design systems and theming, accessibility and WCAG, web performance, i18n, and conversion-rate work on pages and forms.',
    match: /^(react|nextjs|angular|frontend|web-|3d-web|scroll-experience|algorithmic-art|canvas-design|radix-ui|theme-factory|stitch-ui|ui-ux|mobile-design|design-md|design-orchestration|wcag|accessibility|i18n|form-cro|page-cro|browser-extension|screenshots|claude-d3js)/,
  },
  {
    name: 'skills-data-ai',
    description:
      'Data and models: data engineering and pipelines, dbt, Spark, Airflow, databases from Postgres to vector stores, RAG and embeddings, LLM application patterns and evaluation, prompt engineering, agent memory, and multi-agent orchestration.',
    match: /(^(data-|database|postgres|nosql|sql|dbt|spark|airflow|vector|embedding|similarity|hybrid-search|rag-|ml-|mlops|llm-|prompt|agent-|autonomous-agent|multi-agent|memory-|context-|conversation-memory|langgraph|langfuse|crewai|computer-vision|gemini-api|imagen|fal-|exa-search|tavily|firecrawl|deep-research|research-engineer|search-specialist|notebooklm|audio-transcriber|podcast|claude-scientific|backtesting|risk-metrics|event-sourcing|event-store)|-engineer$|scientist$)/,
  },
  {
    name: 'skills-devex',
    description:
      'How the work gets done: git and PR workflows, commits and changelogs, TDD and testing patterns, debugging strategies, refactoring and tech debt, code review, planning and plan execution, worktrees, and authoring skills themselves.',
    match: /(^(commit|git-|github-|bitbucket|changelog|tdd-|test-|testing-patterns|debug|systematic-debugging|error-|code-|codebase-|refactor|clean-code|architect-review|architecture|senior-|production-code-audit|plan-|planning-|executing-plans|finishing-a|using-git|using-superpowers|skill-|conductor-|dispatching-parallel|behavioral-modes|kaizen|loki-mode|blockrun|dx-optimizer|framework-migration|legacy-modernizer|api-design|api-documenter|performance-profiling|performance-testing|application-performance|full-stack|backend-dev|backend-security-coder|frontend-security-coder|team-collaboration|track-management|context7|claude-code-guide|claude-win11|cc-skill|readme$|design-orchestration)|-workflows$)/,
  },
  {
    name: 'skills-integrations',
    description:
      'Wiring to other people’s systems: the automation skills for Slack, Jira, Notion, Asana, HubSpot, Salesforce, Stripe, Zapier and Make, the Google and Microsoft suites, the messaging platforms, and the CRM and helpdesk tools.',
    match: /(-automation$|^(slack-bot|telegram-bot|twilio|stripe-integration|hubspot|segment-cdp|salesforce-development|zapier-make|n8n-node|make-automation|observe-whatsapp|automate-whatsapp|linear-claude|moodle))/,
  },
  {
    name: 'skills-business',
    description:
      'The commercial side: SEO from keywords to content refresh, paid ads and marketing psychology, pricing and launch strategy, startup analysis and financial modelling, product management, HR and culture, customer support and sales.',
    match: /^(seo-|marketing-|paid-ads|pricing|launch-strategy|startup-|competitive|competitor|product-manager|programmatic-seo|free-tool|micro-saas|viral-generator|ai-wrapper|hr-pro|culture-index|team-composition|customer-support|sales-automator|billing|helpdesk|risk-manager|internal-comms|social-content|copywriting|copy-editing|content-creator|marketing-ideas|analytics-tracking|daily-news|last30days|infinite-gratitude)/,
  },
  {
    name: 'skills-content-docs',
    description:
      'Writing and publishing: documentation architecture and templates, wikis and VitePress, tutorials, Mermaid diagrams, Office documents, doc co-authoring, and the video and article publishing skills.',
    match: /^(doc|docs-|documentation|wiki-|tutorial|mermaid|docx|xlsx|nanobanana|x-article|youtube-|data-storytelling|i18n-localization|prompt-library|design-md)/,
  },
]

// ---------------------------------------------------------------------------

const readFrontmatter = (text) => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  return m ? { block: m[1], end: m[0].length } : null
}

// The only frontmatter keys Claude Code recognises for agents and skills. Needed
// because a description can itself contain lines like `user: "..."`, so "the next
// line that looks like a key" is not a safe way to find where it ends.
const KNOWN_KEYS =
  /^(name|tools|model|color|disallowedTools|permissionMode|maxTurns|skills|mcpServers|hooks|memory|background|effort|isolation|initialPrompt|allowed-tools|source|risk|license|version|author|metadata|disable-model-invocation|argument-hint|user-invocable):/

/**
 * Re-emit `description` as a block scalar when a plain one would not parse.
 *
 * Upstream writes descriptions like `description: Use this agent when X. Examples:
 * <example> Context: adding a feature user: "..."`. A YAML plain scalar cannot
 * contain a colon-space, so 32 of the agent files fail to parse — and Claude Code
 * does not reject those, it loads the agent with *empty metadata*: no description,
 * no tools. The agent appears in the list and Claude never has cause to dispatch
 * to it. Block scalars carry the text through verbatim, colons and all.
 */
function fixDescription(block) {
  const lines = block.split('\n')
  const start = lines.findIndex((l) => /^description:/.test(l))
  if (start < 0) return block

  let end = start + 1
  while (end < lines.length && !KNOWN_KEYS.test(lines[end])) end++

  const first = lines[start].slice('description:'.length).trim()
  const body = [first, ...lines.slice(start + 1, end)].join('\n').replace(/\s+$/, '')

  // Already quoted and on one line? It parses; leave it exactly as it was.
  if (end === start + 1 && /^(".*"|'.*')$/.test(first)) return block
  if (end === start + 1 && !first.includes(': ') && !first.includes('#')) return block

  const indented = body.split('\n').map((l) => (l.trim() ? `  ${l}` : '')).join('\n')
  return [...lines.slice(0, start), 'description: |-', indented, ...lines.slice(end)].join('\n')
}

/**
 * Quote tool entries that contain a colon-space, e.g.
 * `allowed-tools:\n- WebFetch(domain: linear.app)`, which YAML otherwise reads as
 * a nested mapping rather than a tool name.
 *
 * Scoped to the sequence directly under a tools key and stopped at the first line
 * that is not one of its entries: a blanket regex over the whole block also
 * rewrites `- type: command` inside a `hooks:` mapping, which breaks the file.
 */
function fixToolLists(block) {
  const lines = block.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^(allowed-tools|tools|disallowedTools):\s*$/.test(lines[i])) continue
    for (let j = i + 1; j < lines.length; j++) {
      const entry = /^(\s*-\s+)(.*)$/.exec(lines[j])
      if (!entry) break
      const [, dash, value] = entry
      if (value.includes(': ') && !/^["']/.test(value)) lines[j] = dash + JSON.stringify(value)
    }
  }
  return lines.join('\n')
}

/** Rewrite (or synthesise) frontmatter so `name` is the file's own stem. */
function normaliseAgent(text, stem) {
  const fm = readFrontmatter(text)

  if (!fm) {
    // No frontmatter at all. Build one from the file's own "## Description".
    const d = /##\s+Description\s*\n+([\s\S]*?)(?=\n#{2,3}\s|\n*$)/.exec(text)
    const sentence = (d ? d[1] : '').replace(/\s+/g, ' ').trim().split(/(?<=\.)\s/)[0]
    const description = sentence || `The ${stem.replace(/-/g, ' ')} agent.`
    return `---\nname: ${stem}\ndescription: ${JSON.stringify(description)}\n---\n\n${text.replace(/^#\s+.*\n+/, '')}`
  }

  const named = new RegExp(`^name:\\s*${stem}\\s*$`, 'm').test(fm.block)
    ? fm.block
    : fm.block.replace(/^name:.*$/m, `name: ${stem}`)
  const block = fixToolLists(fixDescription(named))
  if (block === fm.block) return text // nothing to change — leave byte-identical
  return `---\n${block}\n---\n${text.slice(fm.end)}`
}

/** A skill's invocation name comes from its directory, so both are lowercased. */
function normaliseSkill(text, name) {
  const fm = readFrontmatter(text)
  if (!fm) return `---\nname: ${name}\ndescription: ${JSON.stringify(name.replace(/-/g, ' '))}\n---\n\n${text}`
  const named = /^name:/m.test(fm.block)
    ? fm.block.replace(/^name:.*$/m, `name: ${name}`)
    : `name: ${name}\n${fm.block}`
  const block = fixToolLists(fixDescription(named))
  if (block === fm.block) return text
  return `---\n${block}\n---\n${text.slice(fm.end)}`
}

const descriptionOf = (text) => {
  const fm = readFrontmatter(text)
  if (!fm) return ''
  const i = fm.block.indexOf('description:')
  if (i < 0) return ''
  const rest = fm.block.slice(i + 'description:'.length)
  const stop = /\n(color|tools|model|allowed-tools|permissionMode|effort|license):/.exec(rest)
  return (stop ? rest.slice(0, stop.index) : rest).trim()
}

const writePluginManifest = (dir, name, description, components) =>
  writeFileSync(
    join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name, version: VERSION, description, author: AUTHOR, ...components }, null, 2) + '\n',
  )

const fresh = (dir) => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  return dir
}

const die = (msg) => {
  console.error(`\n  ✗ ${msg}\n`)
  process.exit(1)
}

// --- agents ----------------------------------------------------------------

const agentFiles = readdirSync(AGENT_SRC).filter((f) => f.endsWith('.md')).sort()

// Five personas upstream ship with no frontmatter, so nothing distinguishes them
// from the playbooks and templates that also live in that directory except
// reading them. They are listed rather than pattern-matched: a heuristic on
// "## Description" also swallows handoff-templates.md, which quotes that heading
// inside a fenced example.
const PROSE_PERSONAS = [
  'content-creator', 'growth-hacker', 'instagram-curator',
  'reddit-community-builder', 'twitter-engager',
]

const isAgent = (f) => {
  const fm = readFrontmatter(readFileSync(join(AGENT_SRC, f), 'utf8'))
  return (fm && /^name:/m.test(fm.block)) || PROSE_PERSONAS.includes(f.slice(0, -3))
}

const agents = agentFiles.filter(isAgent).map((f) => f.slice(0, -3))
const skipped = agentFiles.filter((f) => !isAgent(f)).map((f) => f.slice(0, -3))

const assigned = new Map()
for (const plugin of AGENT_PLUGINS) {
  for (const stem of agents) {
    if (assigned.has(stem)) continue
    const claimed = plugin.files.includes(stem) || (plugin.prefixes || []).some((p) => stem.startsWith(p))
    if (claimed) assigned.set(stem, plugin.name)
  }
}

const orphans = agents.filter((s) => !assigned.has(s))
if (orphans.length) die(`${orphans.length} agent(s) match no plugin rule: ${orphans.join(', ')}`)

const agentTokens = {}
for (const plugin of AGENT_PLUGINS) {
  const mine = agents.filter((s) => assigned.get(s) === plugin.name)
  if (!mine.length) die(`plugin ${plugin.name} claimed no agents`)
  const dir = fresh(join(REPO, 'plugins', plugin.name))
  mkdirSync(join(dir, 'agents'), { recursive: true })
  let chars = 0
  for (const stem of mine) {
    const out = normaliseAgent(readFileSync(join(AGENT_SRC, `${stem}.md`), 'utf8'), stem)
    writeFileSync(join(dir, 'agents', `${stem}.md`), out)
    chars += descriptionOf(out).length + stem.length
  }
  // No `agents` key: the manifest schema rejects a directory string there, and
  // agents/ at the plugin root is discovered by default.
  writePluginManifest(dir, plugin.name, plugin.description, {})
  agentTokens[plugin.name] = { count: mine.length, tokens: Math.round(chars / 4) }
}

// --- skills ----------------------------------------------------------------

const skillDirs = readdirSync(SKILL_SRC).filter((d) => existsSync(join(SKILL_SRC, d, 'SKILL.md'))).sort()
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const seen = new Map()
for (const d of skillDirs) {
  const k = kebab(d)
  if (seen.has(k)) die(`skill directories ${seen.get(k)} and ${d} both lowercase to ${k}`)
  seen.set(k, d)
}

const bucketOf = (name) => SKILL_PLUGINS.find((p) => p.match.test(name))?.name ?? 'skills-misc'
const buckets = new Map()
for (const d of skillDirs) {
  const name = kebab(d)
  const b = bucketOf(name)
  if (!buckets.has(b)) buckets.set(b, [])
  buckets.get(b).push({ dir: d, name })
}

const ALL_SKILL_PLUGINS = [
  ...SKILL_PLUGINS,
  {
    name: 'skills-misc',
    description:
      'The skills that fit none of the other groups cleanly — kept together rather than filed somewhere misleading.',
  },
]

const skillTokens = {}
for (const plugin of ALL_SKILL_PLUGINS) {
  const mine = buckets.get(plugin.name) ?? []
  if (!mine.length) continue
  const dir = fresh(join(REPO, 'plugins', plugin.name))
  let chars = 0
  for (const { dir: srcDir, name } of mine) {
    mkdirSync(join(dir, 'skills', name), { recursive: true })
    const out = normaliseSkill(readFileSync(join(SKILL_SRC, srcDir, 'SKILL.md'), 'utf8'), name)
    writeFileSync(join(dir, 'skills', name, 'SKILL.md'), out)
    chars += descriptionOf(out).length + name.length
  }
  writePluginManifest(dir, plugin.name, plugin.description, { skills: './skills/' })
  skillTokens[plugin.name] = { count: mine.length, tokens: Math.round(chars / 4) }
}

// --- marketplace -----------------------------------------------------------

const marketplacePath = join(REPO, '.claude-plugin', 'marketplace.json')
const marketplace = JSON.parse(readFileSync(marketplacePath, 'utf8'))
const generated = [...AGENT_PLUGINS, ...ALL_SKILL_PLUGINS].filter((p) => buckets.has(p.name) || agentTokens[p.name])

marketplace.plugins = [
  ...marketplace.plugins.filter((p) => !p.name.startsWith('agents-') && !p.name.startsWith('skills-')),
  ...generated.map((p) => ({
    name: p.name,
    source: `./plugins/${p.name}`,
    description: p.description,
    category: p.name.startsWith('agents-') ? 'agents' : 'skills',
    // Installed disabled: enabling every group at once would put roughly 42k
    // tokens of descriptions into every session.
    defaultEnabled: false,
  })),
]
writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n')

// --- report ----------------------------------------------------------------

const total = (o) => Object.values(o).reduce((a, b) => a + b.tokens, 0)
const rows = [...Object.entries(agentTokens), ...Object.entries(skillTokens)]
console.log('\n  plugin                        items   ~tokens when enabled')
console.log('  ' + '-'.repeat(58))
for (const [name, { count, tokens }] of rows) {
  console.log(`  ${name.padEnd(28)} ${String(count).padStart(5)}   ${String(tokens).padStart(6)}`)
}
console.log('  ' + '-'.repeat(58))
console.log(
  `  ${'TOTAL'.padEnd(28)} ${String(rows.reduce((a, [, r]) => a + r.count, 0)).padStart(5)}   ` +
    `${String(total(agentTokens) + total(skillTokens)).padStart(6)}\n`,
)
console.log(`  agents vendored: ${agents.length}   skills vendored: ${skillDirs.length}`)
console.log(`  not agents, left upstream (playbooks, runbooks, templates): ${skipped.length}`)
console.log(`    ${skipped.join(', ')}\n`)
