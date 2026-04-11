import { loadSchedules } from "./storage";
import type { ScheduleEntry } from "./types";
import type { FilterTab } from "./schedule-helpers";

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
 * palette. Loads schedules from storage, seeds initial selection, and
 * triggers the first render.
 */
export async function renderPanel(cb: PanelCallbacks): Promise<void> {
  callbacks = cb;
  cachedSchedules = await loadSchedules();

  // Auto-select first schedule on open if nothing is selected yet.
  if (!selectedId && cachedSchedules.length > 0 && paneMode === "view") {
    selectedId = cachedSchedules[0].id;
  }

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

  const focusInfo = captureFocus(root);
  root.innerHTML = panelShell();
  wireUp(root, callbacks);
  restoreFocus(root, focusInfo);
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
  // Search and filter-tabs are wired by later tasks; today they're decoration.
  const items = cachedSchedules.length === 0
    ? `<div class="sidebar-empty">No schedules yet</div>`
    : cachedSchedules.map(renderSchedItem).join("");

  return `
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="search">
          <input id="sidebar-search" type="text" placeholder="Search schedules…" value="${escapeHtml(searchQuery)}" />
        </div>
        <div class="filter-tabs">
          <button data-tab="all" class="${activeTab === "all" ? "active" : ""}" type="button">All</button>
          <button data-tab="active" class="${activeTab === "active" ? "active" : ""}" type="button">Active</button>
          <button data-tab="paused" class="${activeTab === "paused" ? "active" : ""}" type="button">Paused</button>
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

  // Placeholder for the rich view mode (title row, actions, next-fire card,
  // configuration card, recent runs). Filled in by later tasks.
  return `
    <main class="detail">
      <button class="back-btn" id="back-to-list" type="button">← Schedules</button>
      <div class="title-row">
        <div>
          <h3>${escapeHtml(selected.label)}</h3>
          <div class="subtitle">${escapeHtml(selected.naturalLanguage)}</div>
        </div>
      </div>
    </main>
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
