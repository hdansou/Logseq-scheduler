/**
 * Direct Datascript queries against the live DB.
 *
 * We prefer these over `logseq.Editor.getPage()` for existence checks because
 * the SDK-level call can return stale or ghost entities (soft-deleted pages,
 * tag/class entities that share a title, cached responses). A Datascript
 * query hits the live DB with no SDK-level caching.
 */

export interface DbPageMatch {
  id: number;
  uuid: string;
  title?: string;
  name?: string;
}

/**
 * Look up a page by title. Only returns entities that are tagged with the
 * built-in `:logseq.class/Page` class — so we don't confuse tags, classes,
 * properties, or other entity types for user-visible pages.
 *
 * Returns the first match, or null if no live page has that title.
 */
export async function findPageByTitle(
  title: string,
): Promise<DbPageMatch | null> {
  // Strict query: entity has the given title AND is a Page class instance.
  const strictQuery = `
    [:find (pull ?p [:db/id :block/uuid :block/title :block/name])
     :in $ ?title
     :where
     [?p :block/title ?title]
     [?p :block/tags ?t]
     [?t :db/ident :logseq.class/Page]]
  `;

  // Permissive fallback: match by title alone. Used only for diagnostic
  // logging so we can see if an entity exists under that title but isn't
  // classified as a Page (e.g., it's a class/tag definition instead).
  const permissiveQuery = `
    [:find (pull ?p [:db/id :block/uuid :block/title :block/name])
     :in $ ?title
     :where
     [?p :block/title ?title]]
  `;

  try {
    const strictRows = await logseq.DB.datascriptQuery(
      strictQuery,
      `"${escapeDatalogString(title)}"`,
    );
    console.info(
      `[scheduler] findPageByTitle("${title}") strict →`,
      strictRows,
    );
    const strictHit = extractFirst(strictRows);
    if (strictHit) return strictHit;

    // Strict query returned nothing — run permissive for diagnostics only.
    const permissiveRows = await logseq.DB.datascriptQuery(
      permissiveQuery,
      `"${escapeDatalogString(title)}"`,
    );
    if (Array.isArray(permissiveRows) && permissiveRows.length > 0) {
      console.info(
        `[scheduler] findPageByTitle("${title}") permissive (diagnostic) →`,
        permissiveRows,
        `— entity(s) exist under this title but are NOT classified as :logseq.class/Page, so we treat the page as absent and will create it fresh.`,
      );
    }
    return null;
  } catch (err) {
    console.error(
      `[scheduler] findPageByTitle("${title}") query failed:`,
      err,
    );
    return null;
  }
}

function extractFirst(rows: unknown): DbPageMatch | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  // Datascript pull results come back as [[entity], [entity], ...]
  // where each entity is the pulled map.
  const first = rows[0];
  const entity = Array.isArray(first) ? first[0] : first;
  if (!entity || typeof entity !== "object") return null;
  const e = entity as any;
  if (typeof e.id !== "number" && typeof e["db/id"] !== "number") return null;
  return {
    id: e.id ?? e["db/id"],
    uuid: e.uuid ?? e["block/uuid"],
    title: e.title ?? e["block/title"],
    name: e.name ?? e["block/name"],
  };
}

/** Escape double quotes in strings interpolated into datalog query args. */
function escapeDatalogString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
