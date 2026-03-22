# Kanban Watcher Card Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Home Assistant Lovelace custom card that reads `sensor.kanban_watcher_kanban_watcher`, groups workspaces into `需要注意` / `运行中` / `空闲`, and renders them as collapsible compact task sections.

**Architecture:** Implement a custom Home Assistant card in TypeScript with Lit. Keep the logic split into three focused units: data normalization/grouping, relative time/status formatting, and the card UI component. The UI renders only non-empty sections, defaults them to expanded, and shows a single empty state when no workspaces are available.

**Tech Stack:** TypeScript, Lit, Home Assistant custom card APIs, Vite, Vitest

---

## File Structure

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/kanban-watcher-card.ts`
- Create: `src/types.ts`
- Create: `src/lib/group-workspaces.ts`
- Create: `src/lib/format-relative-time.ts`
- Create: `src/lib/status-meta.ts`
- Create: `src/styles.ts`
- Create: `src/index.ts`
- Create: `tests/group-workspaces.test.ts`
- Create: `tests/format-relative-time.test.ts`
- Create: `tests/kanban-watcher-card.test.ts`
- Modify: `README.md`

## Implementation Notes

- Build as a Home Assistant custom card instead of plain Lovelace YAML.
- Use a single entity config field, for example:

```yaml
type: custom:kanban-watcher-card
entity: sensor.kanban_watcher_kanban_watcher
title: Kanban Watcher
```

- Keep section collapse state in component local state only for v1.
- Use `completed_at` when available for completed tasks; otherwise fall back to entity-level `updated_at`; otherwise show `recently`.
- Treat missing numeric stats as `0`.
- Hide sections with no tasks.

## Chunk 1: Project Scaffold

### Task 1: Create package manifest

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write the failing scaffold expectation in README notes**

Add a short TODO note in `README.md` describing the expected build outputs: `dist/kanban-watcher-card.js`.

- [ ] **Step 2: Run a file check to confirm package manifest does not exist**

Run: `test -f package.json; echo $?`
Expected: `1`

- [ ] **Step 3: Create the package manifest**

Include dependencies and scripts:

```json
{
  "name": "kanban-watcher",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "dev": "vite build --watch"
  },
  "dependencies": {
    "lit": "^3.2.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.8.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 4: Run dependency manifest validation**

Run: `npm install`
Expected: install completes and creates `package-lock.json`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json README.md
git commit -m "chore: scaffold custom card toolchain"
```

### Task 2: Create TypeScript and Vite configuration

**Files:**
- Create: `tsconfig.json`
- Create: `vite.config.ts`

- [ ] **Step 1: Write the failing build expectation**

Run: `npm run build`
Expected: FAIL because `vite.config.ts` and source entry do not exist yet

- [ ] **Step 2: Create `tsconfig.json`**

Use DOM-capable strict config:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": false,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

Build library entry `src/index.ts` into `dist/kanban-watcher-card.js`.

- [ ] **Step 4: Run build again**

Run: `npm run build`
Expected: FAIL because source files are still missing

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json vite.config.ts
git commit -m "chore: add TypeScript build config"
```

## Chunk 2: Data Modeling and Formatting

### Task 3: Define entity and workspace types

**Files:**
- Create: `src/types.ts`
- Test: `tests/group-workspaces.test.ts`

- [ ] **Step 1: Write the failing test**

Create a fixture in `tests/group-workspaces.test.ts` that models:
- an attention workspace
- a running workspace
- a completed workspace

Assert that the grouping helper can consume a typed entity object.

- [ ] **Step 2: Run the targeted test**

Run: `npm test -- tests/group-workspaces.test.ts`
Expected: FAIL because `src/types.ts` and grouping helper do not exist

- [ ] **Step 3: Create `src/types.ts`**

Define:

```ts
export interface KanbanWorkspace {
  id: string;
  name: string;
  status?: string;
  has_unseen_turns?: boolean;
  has_pending_approval?: boolean;
  files_changed?: number;
  lines_added?: number;
  lines_removed?: number;
  completed_at?: string;
  needs_attention?: boolean;
  pr_status?: string;
  pr_url?: string;
}

export interface KanbanEntityAttributes {
  count?: number;
  attention_count?: number;
  updated_at?: string;
  workspaces?: KanbanWorkspace[];
}
```

- [ ] **Step 4: Run the targeted test again**

Run: `npm test -- tests/group-workspaces.test.ts`
Expected: FAIL because grouping implementation is still missing

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/group-workspaces.test.ts
git commit -m "feat: add kanban entity types"
```

### Task 4: Implement workspace grouping

**Files:**
- Create: `src/lib/group-workspaces.ts`
- Test: `tests/group-workspaces.test.ts`

- [ ] **Step 1: Expand the failing test**

Add assertions that:
- attention and pending approval go to `attention`
- running goes to `running` if not attention
- everything else goes to `idle`
- empty sections are represented as empty arrays

- [ ] **Step 2: Run the targeted test**

Run: `npm test -- tests/group-workspaces.test.ts`
Expected: FAIL with missing `groupWorkspaces`

- [ ] **Step 3: Write minimal implementation**

Implement:

```ts
export interface WorkspaceSections {
  attention: KanbanWorkspace[];
  running: KanbanWorkspace[];
  idle: KanbanWorkspace[];
}

export function groupWorkspaces(workspaces: KanbanWorkspace[] = []): WorkspaceSections {
  return workspaces.reduce<WorkspaceSections>(
    (sections, workspace) => {
      if (workspace.needs_attention || workspace.has_pending_approval) {
        sections.attention.push(workspace);
      } else if (workspace.status === "running") {
        sections.running.push(workspace);
      } else {
        sections.idle.push(workspace);
      }
      return sections;
    },
    { attention: [], running: [], idle: [] },
  );
}
```

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- tests/group-workspaces.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/group-workspaces.ts tests/group-workspaces.test.ts
git commit -m "feat: group workspaces into display sections"
```

### Task 5: Implement relative time formatting

**Files:**
- Create: `src/lib/format-relative-time.ts`
- Test: `tests/format-relative-time.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- `just now` for under a minute
- `5m ago`
- `2h ago`
- `1d ago`
- fallback `recently` when input is missing or invalid

- [ ] **Step 2: Run the targeted test**

Run: `npm test -- tests/format-relative-time.test.ts`
Expected: FAIL with missing formatter

- [ ] **Step 3: Write minimal implementation**

Expose:

```ts
export function formatRelativeTime(input?: string, now = new Date()): string
```

Use `Date.parse`, compute minute/hour/day buckets, and return:
- `just now`
- `${n}m ago`
- `${n}h ago`
- `${n}d ago`
- `recently`

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- tests/format-relative-time.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/format-relative-time.ts tests/format-relative-time.test.ts
git commit -m "feat: add relative time formatting"
```

### Task 6: Implement status metadata mapping

**Files:**
- Create: `src/lib/status-meta.ts`
- Test: `tests/kanban-watcher-card.test.ts`

- [ ] **Step 1: Write the failing test**

Assert icon and accent metadata for:
- attention
- pending approval
- running
- completed or idle default

- [ ] **Step 2: Run the targeted test**

Run: `npm test -- tests/kanban-watcher-card.test.ts`
Expected: FAIL with missing status helper

- [ ] **Step 3: Write minimal implementation**

Return display metadata:

```ts
interface StatusMeta {
  leadingIcon: string;
  approvalIcon?: string;
  accentClass: string;
}
```

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- tests/kanban-watcher-card.test.ts`
Expected: still FAIL because the card component is not built yet, but helper imports should resolve

- [ ] **Step 5: Commit**

```bash
git add src/lib/status-meta.ts tests/kanban-watcher-card.test.ts
git commit -m "feat: add status display metadata"
```

## Chunk 3: Card Component and Styling

### Task 7: Create shared styles

**Files:**
- Create: `src/styles.ts`
- Test: `tests/kanban-watcher-card.test.ts`

- [ ] **Step 1: Write the failing render expectation**

Assert that the rendered card includes:
- section headers
- workspace title text
- file change summary text

- [ ] **Step 2: Run the targeted test**

Run: `npm test -- tests/kanban-watcher-card.test.ts`
Expected: FAIL because the card component does not exist

- [ ] **Step 3: Create `src/styles.ts`**

Export a `css` block for:
- card container spacing
- section header layout
- chevron rotation state
- task card two-line layout
- muted metadata row
- green/red diff counts
- hidden empty state spacing

- [ ] **Step 4: Run the targeted test**

Run: `npm test -- tests/kanban-watcher-card.test.ts`
Expected: FAIL because component implementation is still missing

- [ ] **Step 5: Commit**

```bash
git add src/styles.ts tests/kanban-watcher-card.test.ts
git commit -m "feat: add card styles"
```

### Task 8: Build the custom card component

**Files:**
- Create: `src/kanban-watcher-card.ts`
- Create: `src/index.ts`
- Test: `tests/kanban-watcher-card.test.ts`

- [ ] **Step 1: Expand the failing test**

Cover:
- card reads configured entity
- only non-empty sections render
- section headers show in order
- task cards render two lines of content
- empty board renders `当前没有任务`
- tapping a section header collapses and expands that section

- [ ] **Step 2: Run the targeted test**

Run: `npm test -- tests/kanban-watcher-card.test.ts`
Expected: FAIL with missing custom element

- [ ] **Step 3: Write minimal implementation**

Implement a Lit element that:
- accepts `hass` and `config`
- reads `hass.states[config.entity]`
- extracts `workspaces`
- groups workspaces with `groupWorkspaces`
- renders visible sections in fixed order
- keeps `collapsedSections` in local component state
- formats each task card with `status-meta` and `format-relative-time`
- shows file stats as `📄 {files} +{added} -{removed}`

- [ ] **Step 4: Register the card**

In `src/index.ts`, define the custom element and push a descriptor into `window.customCards`.

- [ ] **Step 5: Run the targeted test**

Run: `npm test -- tests/kanban-watcher-card.test.ts`
Expected: PASS

- [ ] **Step 6: Run the production build**

Run: `npm run build`
Expected: PASS and generate `dist/kanban-watcher-card.js`

- [ ] **Step 7: Commit**

```bash
git add src tests dist package-lock.json
git commit -m "feat: implement kanban watcher custom card"
```

## Chunk 4: Documentation and Integration

### Task 9: Document installation and usage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the failing docs checklist**

List the missing doc sections:
- install dependencies
- build output
- copy artifact to Home Assistant
- Lovelace config snippet

- [ ] **Step 2: Update `README.md`**

Document:
- local development commands
- where the built file is generated
- how to add the resource in Home Assistant
- example Lovelace config
- data assumptions for `workspaces`

- [ ] **Step 3: Run a final verification sweep**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add README.md dist
git commit -m "docs: add custom card usage instructions"
```

## Final Verification

- [ ] Run: `npm test`
Expected: all tests pass

- [ ] Run: `npm run build`
Expected: `dist/kanban-watcher-card.js` exists

- [ ] Verify the built card in Home Assistant with:
  - only attention tasks
  - mixed sections
  - all sections empty

## Handoff Notes

- Keep the first release display-only.
- Do not add task click navigation yet.
- Do not persist collapse state across reloads in v1.
- If Home Assistant-specific typing becomes noisy, keep local interfaces minimal and focused on the fields this card actually uses.
