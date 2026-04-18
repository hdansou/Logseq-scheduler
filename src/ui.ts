import { parseNaturalLanguage } from "./nl-cron";
import { loadFireLog, loadSchedules, saveSchedules } from "./storage";
import type { FireLogEntry, ScheduleEntry } from "./types";
import {
  computeStats,
  filterSchedules,
  formatCountdown,
  formatPast,
  searchSchedules,
  type FilterTab,
} from "./schedule-helpers";

export interface PanelCallbacks {
  onChange: () => Promise<void> | void;
  runNow: (scheduleId: string, force?: boolean) => Promise<void>;
  nextRunFor: (scheduleId: string) => Date | null;
  currentGraphName: () => string;
}

type PaneMode = "view" | "edit" | "create";

// Module-level UI state. Persists across re-renders so search input,
// selection, and filter tab survive a full innerHTML rebuild.
let selectedId: string | null = null;
let searchQuery = "";
let activeTab: FilterTab = "all";
let paneMode: PaneMode = "view";
let cachedSchedules: ScheduleEntry[] = [];
let cachedFireLog: FireLogEntry[] = [];
let callbacks: PanelCallbacks | null = null;
let needsInitialSeed = true;
let escListenerAttached = false;

/**
 * Entry point invoked when the user opens the panel via toolbar or command
 * palette.
 */
export async function renderPanel(cb: PanelCallbacks): Promise<void> {
  callbacks = cb;
  needsInitialSeed = true;
  attachEscListener();
  await rerender();
}

/**
 * Escape key behaviour:
 *   - When in create/edit mode, Esc cancels the form back to view mode
 *     (same effect as clicking Cancel).
 *   - Otherwise Esc closes the panel.
 * Attached once to the iframe's document and persists across re-renders,
 * so we don't stack duplicate listeners on every rerender.
 */
function attachEscListener(): void {
  if (escListenerAttached) return;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.isComposing) return;
    if (paneMode === "create" || paneMode === "edit") {
      event.preventDefault();
      paneMode = "view";
      void rerender();
      return;
    }
    event.preventDefault();
    logseq.hideMainUI({ restoreEditingCursor: true });
  });
  escListenerAttached = true;
}

/**
 * Re-renders the entire panel from current state. Captures focus before
 * tearing down the DOM and restores it afterward so typing in the search
 * input doesn't lose focus on each keystroke.
 */
async function rerender(): Promise<void> {
  const root = document.getElementById("app");
  if (!root || !callbacks) return;

  [cachedSchedules, cachedFireLog] = await Promise.all([
    loadSchedules(),
    loadFireLog(),
  ]);

  if (needsInitialSeed) {
    seedInitialSelection();
    needsInitialSeed = false;
  }
  cleanupStaleSelection();

  const focusInfo = captureFocus(root);
  root.innerHTML = panelShell();
  wireUp(root);
  restoreFocus(root, focusInfo);
}

/**
 * On panel open: pre-select the first schedule if no selection survives
 * from a previous session. Skipped in create/edit mode.
 */
function seedInitialSelection(): void {
  if (paneMode !== "view") return;
  if (selectedId && cachedSchedules.some((s) => s.id === selectedId)) return;
  selectedId = cachedSchedules[0]?.id ?? null;
}

/**
 * Clears the selection if the schedule it points to no longer exists
 * (e.g., deleted in another tab). Does NOT auto-pick a new selection —
 * that's the responsibility of explicit handlers like delete.
 */
function cleanupStaleSelection(): void {
  if (selectedId && !cachedSchedules.some((s) => s.id === selectedId)) {
    selectedId = null;
  }
}

function panelShell(): string {
  // The has-selection class drives the responsive layout: at narrow widths
  // it controls which pane is visible.
  const hasSelection = (selectedId !== null) || paneMode === "create";
  return `
    <div class="panel${hasSelection ? " has-selection" : ""}">
      ${renderHeader()}
      <div class="panel-body">
        ${renderSidebar()}
        ${renderDetail()}
      </div>
    </div>
  `;
}

function renderHeader(): string {
  const stats = computeStats(
    cachedSchedules,
    (id) => callbacks?.nextRunFor(id) ?? null,
  );
  const nextLabel = formatCountdown(stats.soonestNextFire, new Date());
  return `
    <header class="panel-header">
      <div class="panel-header-left">
        <h2>Scheduler</h2>
        <div class="stats">
          <span><span class="dot"></span><b>${stats.activeCount}</b> active</span>
          <span><b>${stats.pausedCount}</b> paused</span>
          <span>Next ${escapeHtml(nextLabel)}</span>
        </div>
      </div>
      <button id="close-panel" class="close-btn" type="button">Close</button>
    </header>
  `;
}

function renderSidebar(): string {
  // Tab counts always reflect totals, never the current search.
  const totalCount = cachedSchedules.length;
  const activeCount = cachedSchedules.filter((s) => s.enabled).length;
  const pausedCount = totalCount - activeCount;

  const visible = searchSchedules(
    filterSchedules(cachedSchedules, activeTab),
    searchQuery,
  );

  let items: string;
  if (totalCount === 0) {
    items = `<div class="sidebar-empty">No schedules yet</div>`;
  } else if (visible.length === 0) {
    items = `<div class="sidebar-empty">No schedules match</div>`;
  } else {
    items = visible.map(renderSchedItem).join("");
  }

  return `
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="search">
          <input id="sidebar-search" type="text" placeholder="Search schedules…" aria-label="Search schedules" value="${escapeHtml(searchQuery)}" />
        </div>
        <div class="filter-tabs">
          <button data-tab="all" class="${activeTab === "all" ? "active" : ""}" type="button">All (${totalCount})</button>
          <button data-tab="active" class="${activeTab === "active" ? "active" : ""}" type="button">Active (${activeCount})</button>
          <button data-tab="paused" class="${activeTab === "paused" ? "active" : ""}" type="button">Paused (${pausedCount})</button>
        </div>
      </div>
      <div class="sidebar-list">${items}</div>
      <button id="new-schedule" class="new-btn" type="button">+ New schedule</button>
    </aside>
  `;
}

function graphBadge(s: ScheduleEntry): string {
  const raw = s.graphNames?.trim();
  const label = (!raw || raw.toLowerCase() === "all") ? "all graphs" : raw;
  const cls = (!raw || raw.toLowerCase() === "all") ? "graph-badge all" : "graph-badge";
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

function renderSchedItem(s: ScheduleEntry): string {
  const isSelected = s.id === selectedId;
  return `
    <button type="button" class="sched-item${isSelected ? " selected" : ""}" data-id="${escapeHtml(s.id)}" aria-pressed="${isSelected}">
      <div class="row1">
        <div class="label">${escapeHtml(s.label)}</div>
        <div class="status ${s.enabled ? "on" : "off"}" aria-label="${s.enabled ? "Active" : "Paused"}">${s.enabled ? "ON" : "OFF"}</div>
      </div>
      <div class="row2">${escapeHtml(s.naturalLanguage)}</div>
      <div class="row3">${graphBadge(s)}</div>
    </button>
  `;
}

function renderDetail(): string {
  if (paneMode === "create") {
    return renderScheduleForm(null);
  }

  if (cachedSchedules.length === 0) {
    return `
      <main class="detail">
        <div class="detail-empty">
          <div class="empty-icon">⏰</div>
          <div>No schedules yet.</div>
          <div>Click <strong>+ New schedule</strong> to get started.</div>
        </div>
      </main>
    `;
  }

  const selected = cachedSchedules.find((s) => s.id === selectedId);
  if (!selected) {
    return `
      <main class="detail">
        <div class="detail-empty">
          <div>Select a schedule from the list.</div>
        </div>
      </main>
    `;
  }

  if (paneMode === "edit") {
    return renderScheduleForm(selected);
  }

  return `
    <main class="detail">
      <button class="back-btn" id="back-to-list" type="button">← Schedules</button>
      <div class="title-row">
        <div>
          <h3>${escapeHtml(selected.label)}</h3>
          <div class="subtitle">${escapeHtml(selected.naturalLanguage)} · ${selected.enabled ? "Active" : "Paused"}</div>
        </div>
        <div class="title-actions">
          <button class="btn run-now" data-id="${escapeHtml(selected.id)}" type="button">▶ Run Now</button>
          <button class="btn force-run" data-id="${escapeHtml(selected.id)}" type="button">⟳ Force Run</button>
          <button class="btn toggle-enabled" data-id="${escapeHtml(selected.id)}" type="button">${selected.enabled ? "Pause" : "Resume"}</button>
          <button class="btn edit-schedule" data-id="${escapeHtml(selected.id)}" type="button">Edit</button>
          <button class="btn btn-danger delete-schedule" data-id="${escapeHtml(selected.id)}" type="button">Delete</button>
        </div>
      </div>
      ${renderNextFireCard(selected)}
      ${renderConfigCard(selected)}
      ${renderRunsCard(selected)}
    </main>
  `;
}

function renderRunsCard(s: ScheduleEntry): string {
  const runs = cachedFireLog
    .filter((entry) => entry.scheduleId === s.id)
    .slice(0, 10);
  const now = new Date();

  const body =
    runs.length === 0
      ? `<div class="runs-empty">No runs yet.</div>`
      : `<div class="runs-list">${runs.map((entry) => renderRunRow(entry, now)).join("")}</div>`;

  return `
    <div class="card">
      <h4>Recent runs</h4>
      ${body}
    </div>
  `;
}

function renderRunRow(entry: FireLogEntry, now: Date): string {
  const when = formatPast(new Date(entry.at), now);
  const errorAttr = entry.error
    ? ` title="${escapeHtml(entry.error)}"`
    : "";
  return `
    <div class="run-row"${errorAttr}>
      <span class="when">${escapeHtml(when)}</span>
      <span class="source">${escapeHtml(entry.source)}</span>
      <span class="badge ${escapeHtml(entry.outcome)}">${escapeHtml(entry.outcome)}</span>
    </div>
  `;
}

function renderScheduleForm(initial: ScheduleEntry | null): string {
  const label = initial?.label ?? "";
  const pageName = initial?.pageName ?? "";
  const tags = initial?.tags.join(", ") ?? "";
  const nl = initial?.naturalLanguage ?? "";
  const cronText = initial?.cron ? `cron: ${initial.cron}` : "cron: —";
  const title = initial ? `Edit schedule` : "New schedule";
  const graphNames = initial?.graphNames ?? callbacks?.currentGraphName() ?? "";

  return `
    <main class="detail">
      <button class="back-btn" id="back-to-list" type="button">← Schedules</button>
      <h3>${escapeHtml(title)}</h3>
      <form class="detail-form" id="schedule-form">
        <label>Label
          <input id="form-label" type="text" value="${escapeHtml(label)}" placeholder="Personal Weekly Review" />
        </label>
        <label>Page name
          <input id="form-page-name" type="text" value="${escapeHtml(pageName)}" placeholder="Weekly Review" />
        </label>
        <label>Tags (comma-separated)
          <input id="form-tags" type="text" value="${escapeHtml(tags)}" placeholder="weekly-review, personal" />
        </label>
        <label>Graphs
          <input id="form-graphs" type="text" value="${escapeHtml(graphNames)}" placeholder="My Journal, Work — or &quot;all&quot;" />
        </label>
        <label>When
          <input id="form-nl" type="text" value="${escapeHtml(nl)}" placeholder="every Saturday at 11 AM" />
        </label>
        <div class="cron-preview" id="form-cron-preview">${escapeHtml(cronText)}</div>
        <div class="form-error" id="form-error" style="display:none;"></div>
        <div class="form-actions">
          <button type="button" class="btn" id="form-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="form-save">Save</button>
        </div>
      </form>
    </main>
  `;
}

function renderNextFireCard(s: ScheduleEntry): string {
  if (!s.enabled || !callbacks) return "";
  const target = callbacks.nextRunFor(s.id);
  if (!target) return "";
  const countdown = formatCountdown(target, new Date());
  return `
    <div class="next-fire">
      <div class="icon">⏱</div>
      <div>
        <div class="nf-label">Next fire</div>
        <div class="time">${escapeHtml(target.toLocaleString())}</div>
      </div>
      <div class="countdown">${escapeHtml(countdown)}</div>
    </div>
  `;
}

function renderConfigCard(s: ScheduleEntry): string {
  const tagsHtml =
    s.tags.length === 0
      ? `<em>no tags</em>`
      : s.tags
          .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
          .join("");
  return `
    <div class="card">
      <h4>Configuration</h4>
      <dl class="field-grid">
        <dt>Label</dt><dd>${escapeHtml(s.label)}</dd>
        <dt>Page name</dt><dd>${escapeHtml(s.pageName)}</dd>
        <dt>Tags</dt><dd class="chips">${tagsHtml}</dd>
        <dt>Graphs</dt><dd>${graphBadge(s)}</dd>
        <dt>Schedule</dt><dd>${escapeHtml(s.naturalLanguage)}</dd>
        <dt>Cron</dt><dd><code>${escapeHtml(s.cron)}</code></dd>
        <dt>Status</dt><dd>${s.enabled ? "✓ Active" : "○ Paused"}</dd>
      </dl>
    </div>
  `;
}

function wireUp(root: HTMLElement): void {
  root
    .querySelector<HTMLButtonElement>("#close-panel")
    ?.addEventListener("click", () => {
      logseq.hideMainUI({ restoreEditingCursor: true });
    });

  root.querySelectorAll<HTMLButtonElement>(".sched-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      if (!id) return;
      selectedId = id;
      paneMode = "view";
      void rerender();
    });
  });

  root
    .querySelector<HTMLButtonElement>("#back-to-list")
    ?.addEventListener("click", () => {
      selectedId = null;
      paneMode = "view";
      void rerender();
    });

  const searchInput = root.querySelector<HTMLInputElement>("#sidebar-search");
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value;
    void rerender();
  });

  root
    .querySelectorAll<HTMLButtonElement>(".filter-tabs button")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab as FilterTab | undefined;
        if (!tab) return;
        activeTab = tab;
        void rerender();
      });
    });

  root
    .querySelector<HTMLButtonElement>("#new-schedule")
    ?.addEventListener("click", () => {
      paneMode = "create";
      selectedId = null;
      void rerender();
    });

  attachRunHandler(root, ".run-now", false);
  attachRunHandler(root, ".force-run", true);

  root
    .querySelectorAll<HTMLButtonElement>(".toggle-enabled")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (!id) return;
        try {
          const list = await loadSchedules();
          const item = list.find((s) => s.id === id);
          if (!item) return;
          item.enabled = !item.enabled;
          await saveSchedules(list);
          await callbacks?.onChange();
          await rerender();
        } catch (err: unknown) {
          console.error("[scheduler-ui] Failed to toggle schedule:", err);
        }
      });
    });

  root
    .querySelectorAll<HTMLButtonElement>(".edit-schedule")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (!id) return;
        selectedId = id;
        paneMode = "edit";
        void rerender();
      });
    });

  root
    .querySelectorAll<HTMLButtonElement>(".delete-schedule")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (!id) return;
        try {
          const list = (await loadSchedules()).filter((s) => s.id !== id);
          await saveSchedules(list);
          if (selectedId === id) {
            selectedId = list[0]?.id ?? null;
          }
          await callbacks?.onChange();
          await rerender();
        } catch (err: unknown) {
          console.error("[scheduler-ui] Failed to delete schedule:", err);
        }
      });
    });

  if (paneMode === "create" || paneMode === "edit") {
    wireUpScheduleForm(root, paneMode);
  }
}

function wireUpScheduleForm(
  root: HTMLElement,
  mode: "create" | "edit",
): void {
  const cronPreview = root.querySelector<HTMLElement>("#form-cron-preview");
  const nlInput = root.querySelector<HTMLInputElement>("#form-nl");

  nlInput?.addEventListener("input", () => {
    if (!cronPreview) return;
    const value = nlInput.value.trim();
    if (!value) {
      cronPreview.textContent = "cron: —";
      cronPreview.classList.remove("error");
      return;
    }
    try {
      cronPreview.textContent = `cron: ${parseNaturalLanguage(value)}`;
      cronPreview.classList.remove("error");
    } catch (err: unknown) {
      cronPreview.textContent =
        err instanceof Error ? err.message : String(err);
      cronPreview.classList.add("error");
    }
  });

  root
    .querySelector<HTMLButtonElement>("#form-cancel")
    ?.addEventListener("click", () => {
      paneMode = "view";
      void rerender();
    });

  root
    .querySelector<HTMLFormElement>("#schedule-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorEl = root.querySelector<HTMLElement>("#form-error");
      const setError = (msg: string) => {
        if (!errorEl) return;
        errorEl.textContent = msg;
        errorEl.style.display = msg ? "block" : "none";
      };
      setError("");

      const label = (
        root.querySelector<HTMLInputElement>("#form-label")?.value ?? ""
      ).trim();
      const pageName = (
        root.querySelector<HTMLInputElement>("#form-page-name")?.value ?? ""
      ).trim();
      const tagsRaw = (
        root.querySelector<HTMLInputElement>("#form-tags")?.value ?? ""
      ).trim();
      const graphNames = (
        root.querySelector<HTMLInputElement>("#form-graphs")?.value ?? ""
      ).trim() || "all";
      const nl = (
        root.querySelector<HTMLInputElement>("#form-nl")?.value ?? ""
      ).trim();

      if (!label || !pageName || !nl) {
        setError("Label, page name, and schedule are required.");
        return;
      }

      let cron: string;
      try {
        cron = parseNaturalLanguage(nl);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Could not parse schedule.",
        );
        return;
      }

      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

      try {
        const list = await loadSchedules();
        let nextSelectedId = selectedId;

        if (mode === "create") {
          const entry: ScheduleEntry = {
            id: `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            label,
            pageName,
            tags,
            naturalLanguage: nl,
            cron,
            enabled: true,
            createdAt: Date.now(),
            graphNames,
          };
          list.push(entry);
          nextSelectedId = entry.id;
        } else {
          const idx = list.findIndex((s) => s.id === selectedId);
          if (idx === -1) {
            setError("Schedule no longer exists.");
            return;
          }
          list[idx] = {
            ...list[idx],
            label,
            pageName,
            tags,
            naturalLanguage: nl,
            cron,
            graphNames,
          };
        }

        await saveSchedules(list);
        selectedId = nextSelectedId;
        paneMode = "view";
        await callbacks?.onChange();
        await rerender();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[scheduler-ui] Failed to save schedule:", err);
        setError(`Failed to save: ${message}`);
      }
    });
}

function attachRunHandler(
  root: HTMLElement,
  selector: string,
  force: boolean,
): void {
  root.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!id || !callbacks) return;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Running…";
      try {
        await callbacks.runNow(id, force);
        btn.textContent = "Done ✓";
        // Rerender will replace the button entirely; no further cleanup needed.
        setTimeout(() => void rerender(), 600);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler-ui] ${selector} failed:`, err);
        btn.textContent = "Failed";
        btn.title = message;
        // Failure path: restore the button in place so the user can retry
        // without losing context.
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = originalText;
        }, 1500);
      }
    });
  });
}

interface FocusInfo {
  selector: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
}

function captureFocus(root: HTMLElement): FocusInfo {
  const active = document.activeElement as HTMLElement | null;
  if (!active || !root.contains(active)) {
    return { selector: null, selectionStart: null, selectionEnd: null };
  }
  if (active.id === "sidebar-search") {
    const input = active as HTMLInputElement;
    return {
      selector: "#sidebar-search",
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
    };
  }
  return { selector: null, selectionStart: null, selectionEnd: null };
}

function restoreFocus(root: HTMLElement, info: FocusInfo): void {
  if (!info.selector) return;
  const el = root.querySelector<HTMLInputElement>(info.selector);
  if (!el) return;
  el.focus();
  if (info.selectionStart !== null && info.selectionEnd !== null) {
    try {
      el.setSelectionRange(info.selectionStart, info.selectionEnd);
    } catch {
      // Some input types don't support selection ranges; ignore.
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
