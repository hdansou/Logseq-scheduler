## Task List: Upgrade @logseq/libs 0.0.17 → 0.3.2

Started: 2026-04-18
Status: done

### Spec

#### Goal
Upgrade the plugin SDK dependency from `@logseq/libs@^0.0.17` to `@logseq/libs@0.3.2` (published under the `next` npm tag). The new version types all the DB-graph APIs we currently call via `as any` casts and runtime feature detection. The upgrade is purely additive — no breaking changes for our usage.

#### Users
Plugin developers maintaining this codebase.

#### Constraints
- Must: all existing behavior preserved — no runtime changes, only type-level improvements
- Must: remove all `as any` casts that were workarounds for missing types in 0.0.17
- Must: remove `typeof === "function"` runtime guards for APIs now guaranteed by the SDK interface
- Must: `npm run typecheck && npm test && npm run build` pass cleanly
- Must not: change any runtime behavior (only type annotations and cast removal)

#### API Coverage

| API | Old (0.0.17) | New (0.3.2) | Our action |
|---|---|---|---|
| `Editor.getTag()` | Not typed | Typed | Remove `as any` + guard |
| `Editor.getTagsByName()` | Not typed | Typed | Remove `as any` + guard |
| `Editor.createTag()` | Not typed | Typed | Remove `as any` + guard |
| `Editor.addBlockTag()` | Not typed | Typed | Remove `as any` + guard |
| `Editor.getAllTags()` | Not typed | Typed | Remove `as any` + guard |
| `App.checkCurrentIsDbGraph()` | Not typed | Typed | Remove dynamic cast |
| `DB.onChanged()` | Typed but we cast | Typed | Remove `as any` |
| All other APIs we use | Typed | Same | No change |

---

### Tasks

- [x] **1. Bump dependency and install** — `package.json`
      Change `"@logseq/libs": "^0.0.17"` to `"@logseq/libs": "0.3.2"`.
      Run `npm install`. Verify `node_modules/@logseq/libs/package.json` shows 0.3.2.
      Est: 2 min

- [x] **2. Remove as-any casts in page-creator.ts** — `src/page-creator.ts`
      - Line 112/179: `logseq.Editor as any` → `logseq.Editor`
      - Lines 114, 123, 132: remove `typeof editor.xxx === "function"` guards — these methods are guaranteed by the interface now
      - Lines 182-183: remove the `hasAddBlockTag`/`hasCreateTag` capability-detection block
      - Line 186-191: remove the early return for missing `addBlockTag`
      - Preserve the actual error-handling try/catch blocks
      Test: `npm run typecheck` passes
      Est: 15 min

- [x] **3. Remove as-any casts in scheduler.ts** — `src/scheduler.ts`
      - Line 102: `(logseq.DB as any).onChanged?.(() => {` → `logseq.DB.onChanged(({ ... }) => {`
      - Lines 231-235: replace `(logseq.App as unknown as { checkCurrentIsDbGraph?: ... }).checkCurrentIsDbGraph` with direct `logseq.App.checkCurrentIsDbGraph()`
      Test: `npm run typecheck` passes
      Est: 10 min

- [x] **4. Typecheck, test, and build** — full validation
      Run `npm run typecheck && npm test && npm run build`.
      Fix any new type errors from changed generics or widened types.
      Est: 5 min

- [x] **5. Update CHANGELOG** — `CHANGELOG.md`
      Add entry under `[Unreleased]` for the SDK upgrade.
      Est: 2 min

### Progress Log
- 2026-04-18 — Task 1 done: bumped to 0.3.2 via `next` npm tag, `npm install` clean, baseline typecheck/test/build all pass with no code changes.
- 2026-04-18 — Task 2 done: removed all `as any` casts and `typeof` runtime guards in `page-creator.ts`. `resolveTag` returns `PageEntity | null`, `applyTags` takes `Pick<PageEntity, "uuid">`. Import `PageEntity` from SDK types.
- 2026-04-18 — Task 3 done: `DB.onChanged` called directly (no `as any`), `checkCurrentIsDbGraph` called directly (no dynamic cast). Both `as any`/`as unknown` eliminated.
- 2026-04-18 — Task 4 done: typecheck clean, 44 tests pass, build 149.15 KB (down from 149.76 KB — removed runtime guards).
- 2026-04-18 — Task 5 done: CHANGELOG entry added.
- 2026-04-18 — **SDK upgrade complete.** 5/5 tasks done.
