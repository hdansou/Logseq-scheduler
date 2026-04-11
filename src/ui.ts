import { loadSchedules, saveSchedules } from "./storage";
import type { ScheduleEntry } from "./types";
import {
  filterSchedules,
  formatCountdown,
  searchSchedules,
  type FilterTab,
} from "./schedule-helpers";

export interface PanelCallbacks {
  onChange: () => Promise<void> | void;
  runNow: (scheduleId: string, force?: boolean) => Promise<void>;
  nextRunFor: (scheduleId: string) => Date | null;
}

type PaneMode = "view" | "edit" | "create";

// Module-level UI state. Persists across re-renders so search input,
// selection, and filter tab survive a full innerHTML rebuild.
let selectedId: string | null = null;
let searchQuery = "";
let activeTab: FilterTab = "all";
let paneMode: PaneMode = "view";
let cachedSchedules: ScheduleEntry[] = [];
let callbacks: PanelCallbacks | null = null;

/**
 * Entry point invoked when the user opens the panel via toolbar or command
 * palette.
 */
export async function renderPanel(cb: PanelCallbacks): Promise<void> {
  callbacks = cb;
  await rerender();
}

/**
 * Re-renders the entire panel from current state. Captures focus before
 * tearing down the DOM and restores it afterward so typing in the search
 * input doesn't lose focus on each keystroke.
 */
async function rerender(): Promise<void> {
  const root = document.getElementById("app");
  if (!root || !callbacks) return;

  cachedSchedules = await loadSchedules();
  ensureValidSelection();

  const focusInfo = captureFocus(root);
  root.innerHTML = panelShell();
  wireUp(root, callbacks);
  restoreFocus(root, focusInfo);
}

/**
 * Selects the first schedule when nothing is selected, or clears the
 * selection if the previously-selected schedule was deleted. Only runs in
 * view mode — create/edit modes are intentionally allowed to have no
 * selected item.
 */
function ensureValidSelection(): void {
  if (paneMode !== "view") return;
  if (selectedId && cachedSchedules.some((s) => s.id === selectedId)) return;
  selectedId = cachedSchedules[0]?.id ?? null;
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
  // Stats are added by a later task; header is title + close button only.
  return `
    <header class="panel-header">
      <div class="panel-header-left">
        <h2>Scheduler</h2>
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
          <input id="sidebar-search" type="text" placeholder="Search schedules…" value="${escapeHtml(searchQuery)}" />
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

function renderSchedItem(s: ScheduleEntry): string {
  const isSelected = s.id === selectedId;
  return `
    <div class="sched-item${isSelected ? " selected" : ""}" data-id="${escapeHtml(s.id)}">
      <div class="row1">
        <div class="label">${escapeHtml(s.label)}</div>
        <div class="status ${s.enabled ? "on" : "off"}">${s.enabled ? "ON" : "OFF"}</div>
      </div>
      <div class="row2">${escapeHtml(s.naturalLanguage)}</div>
    </div>
  `;
}

function renderDetail(): string {
  if (paneMode === "create") {
    // Placeholder — task 13 (create mode) renders the real form here.
    return `
      <main class="detail">
        <button class="back-btn" id="back-to-list" type="button">← Schedules</button>
        <h3>New schedule</h3>
        <div class="detail-empty">Form coming in the next task.</div>
      </main>
    `;
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
    // Placeholder — task 14 (edit mode) renders the real form here.
    return `
      <main class="detail">
        <button class="back-btn" id="back-to-list" type="button">← Schedules</button>
        <h3>Edit ${escapeHtml(selected.label)}</h3>
        <div class="detail-empty">Form coming in the next task.</div>
      </main>
    `;
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
        <dt>Schedule</dt><dd>${escapeHtml(s.naturalLanguage)}</dd>
        <dt>Cron</dt><dd><code>${escapeHtml(s.cron)}</code></dd>
        <dt>Status</dt><dd>${s.enabled ? "✓ Active" : "○ Paused"}</dd>
      </dl>
    </div>
  `;
}

function wireUp(root: HTMLElement, _cb: PanelCallbacks): void {
  root
    .querySelector<HTMLButtonElement>("#close-panel")
    ?.addEventListener("click", () => {
      logseq.hideMainUI({ restoreEditingCursor: true });
    });

  root.querySelectorAll<HTMLElement>(".sched-item").forEach((el) => {
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
        const list = await loadSchedules();
        const item = list.find((s) => s.id === id);
        if (!item) return;
        item.enabled = !item.enabled;
        await saveSchedules(list);
        await callbacks?.onChange();
        await rerender();
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
        const list = (await loadSchedules()).filter((s) => s.id !== id);
        await saveSchedules(list);
        if (selectedId === id) selectedId = null;
        await callbacks?.onChange();
        await rerender();
      });
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
        setTimeout(() => {
          void rerender();
        }, 600);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[scheduler-ui] ${selector} failed:`, err);
        btn.textContent = "Failed";
        btn.title = message;
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          if (btn.textContent === "Running…" || btn.textContent === "Failed") {
            btn.textContent = originalText;
          }
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
    .replace(/"/g, "&quot;");
}
