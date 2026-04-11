import { findPageByTitle } from "./db";
import { buildPageName, detectFrequency } from "./suffix";
import type { ScheduleEntry } from "./types";

export interface CreateOptions {
  /** If true, delete any existing page with the same name before creating. */
  force?: boolean;
}

/**
 * Create (or no-op if it already exists) a page for a schedule at a given time,
 * then apply the schedule's tags.
 *
 * DB-graph only: file graphs don't have first-class tags-as-classes.
 */
export async function createScheduledPage(
  schedule: ScheduleEntry,
  firedAt: Date,
  timezone: string,
  opts: CreateOptions = {},
): Promise<{ created: boolean; pageName: string }> {
  const frequency = detectFrequency(schedule.cron);
  const pageName = buildPageName(
    schedule.pageName,
    frequency,
    firedAt,
    timezone,
  );

  // Use a live Datascript query (not `Editor.getPage`) so we don't get
  // false positives from soft-deleted / cached / non-page entities.
  const existing = await findPageByTitle(pageName);

  if (existing && !opts.force) {
    console.info(
      `[scheduler] Page "${pageName}" already exists (uuid=${existing.uuid}); skipping creation.`,
    );
    // Still try to apply tags in case they were missing.
    await applyTags({ uuid: existing.uuid }, schedule.tags);
    return { created: false, pageName };
  }

  if (existing && opts.force) {
    console.info(
      `[scheduler] Force-delete existing page "${pageName}" before recreate.`,
    );
    try {
      await logseq.Editor.deletePage(pageName);
    } catch (err) {
      console.error(`[scheduler] deletePage failed:`, err);
    }
    // Give Logseq a tick to commit the delete, then re-verify.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stillThere = await findPageByTitle(pageName);
    if (stillThere) {
      console.warn(
        `[scheduler] After deletePage, the page is still present in DB (uuid=${stillThere.uuid}). createPage may reject or return the ghost.`,
      );
    } else {
      console.info(`[scheduler] deletePage verified: page is gone from DB.`);
    }
  }

  console.info(`[scheduler] Calling createPage("${pageName}")...`);
  const page = await logseq.Editor.createPage(
    pageName,
    {},
    { redirect: false, createFirstBlock: true },
  );
  console.info(`[scheduler] createPage returned:`, page);
  if (!page) {
    throw new Error(`Failed to create page "${pageName}"`);
  }
  const pageUuid = (page as any).uuid;
  console.info(
    `[scheduler] Created page "${pageName}" (uuid=${pageUuid})`,
  );

  // Verify the page is actually queryable before applying tags.
  const verified = await findPageByTitle(pageName);
  if (!verified) {
    console.warn(
      `[scheduler] createPage returned an entity but findPageByTitle can't find "${pageName}". Tagging may fail.`,
    );
  } else {
    console.info(
      `[scheduler] Verified new page in DB: uuid=${verified.uuid}`,
    );
  }

  await applyTags(page, schedule.tags);

  return { created: true, pageName };
}

/**
 * Normalize a tag name for fuzzy matching: lowercase, collapse separators
 * (hyphens, underscores, whitespace) so that "Weekly Plan", "weekly-plan",
 * and "weekly_plan" all compare equal.
 */
function normalizeTagName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]+/g, "");
}

/**
 * Resolve a tag by name, trying progressively looser matches:
 *   1. exact `getTag(name)`
 *   2. exact `getTagsByName(name)`
 *   3. fuzzy search through `getAllTags()` using normalized names
 */
async function resolveTag(tagName: string): Promise<any | null> {
  const editor = logseq.Editor as any;

  if (typeof editor.getTag === "function") {
    try {
      const tag = await editor.getTag(tagName);
      if (tag?.uuid) return tag;
    } catch (err) {
      console.warn(`[scheduler]   getTag error:`, err);
    }
  }

  if (typeof editor.getTagsByName === "function") {
    try {
      const tags = await editor.getTagsByName(tagName);
      if (Array.isArray(tags) && tags[0]?.uuid) return tags[0];
    } catch (err) {
      console.warn(`[scheduler]   getTagsByName error:`, err);
    }
  }

  if (typeof editor.getAllTags === "function") {
    try {
      const all = await editor.getAllTags();
      if (Array.isArray(all)) {
        const target = normalizeTagName(tagName);
        const match = all.find((t: any) => {
          const candidates = [t?.name, t?.title, t?.originalName].filter(
            (s) => typeof s === "string",
          );
          return candidates.some((c) => normalizeTagName(c) === target);
        });
        if (match) {
          console.info(
            `[scheduler]   Fuzzy matched "${tagName}" → "${match.title ?? match.name}"`,
          );
          return match;
        }
        console.info(
          `[scheduler]   Fuzzy match failed. Available tags: ${all
            .map((t: any) => t?.title ?? t?.name)
            .filter(Boolean)
            .join(", ") || "(none)"}`,
        );
      }
    } catch (err) {
      console.warn(`[scheduler]   getAllTags error:`, err);
    }
  }

  return null;
}

/**
 * Apply tags to a page as **class assignments** on the page entity itself —
 * NOT as `#tag` references in a child block.
 *
 * Strategy:
 *   1. Resolve the tag entity (exact, fuzzy, or via getAllTags).
 *   2. If no tag entity exists yet, create it via `createTag(name)`.
 *   3. Link the tag to the page with `addBlockTag(pageUuid, tagUuid)`.
 *
 * We never fall back to inserting `#tagname` into a block — that attaches
 * the tag to the block, not to the page, which is the wrong semantics.
 */
async function applyTags(page: any, tagNames: string[]): Promise<void> {
  if (!tagNames.length) return;

  const editor = logseq.Editor as any;
  const hasAddBlockTag = typeof editor.addBlockTag === "function";
  const hasCreateTag = typeof editor.createTag === "function";
  console.info(
    `[scheduler] Tag APIs available: getTag=${typeof editor.getTag === "function"}, addBlockTag=${hasAddBlockTag}, getTagsByName=${typeof editor.getTagsByName === "function"}, getAllTags=${typeof editor.getAllTags === "function"}, createTag=${hasCreateTag}`,
  );

  if (!hasAddBlockTag) {
    console.warn(
      `[scheduler] addBlockTag is not available in this Logseq build; cannot assign tags as classes. Skipping tag application.`,
    );
    return;
  }

  for (const rawName of tagNames) {
    const tagName = rawName.trim();
    if (!tagName) continue;
    console.info(`[scheduler] Applying tag "${tagName}" as class on page...`);

    try {
      let tag = await resolveTag(tagName);

      if (!tag && hasCreateTag) {
        console.info(`[scheduler]   Tag not found — creating via createTag("${tagName}")`);
        try {
          tag = await editor.createTag(tagName);
          console.info(`[scheduler]   createTag →`, tag);
        } catch (err) {
          console.error(`[scheduler]   createTag failed:`, err);
        }
      }

      if (!tag?.uuid) {
        console.warn(
          `[scheduler]   Could not resolve or create tag "${tagName}"; skipping.`,
        );
        continue;
      }

      await editor.addBlockTag(page.uuid, tag.uuid);
      console.info(
        `[scheduler]   addBlockTag OK (tagged page with "${tag.title ?? tag.name ?? tagName}")`,
      );
    } catch (err) {
      console.error(`[scheduler] Failed to apply tag "${tagName}":`, err);
    }
  }
}
