import { parseNaturalLanguage } from "./nl-cron";
import { loadSchedules, saveSchedules } from "./storage";
import type { ScheduleEntry } from "./types";

export interface PanelCallbacks {
  onChange: () => Promise<void> | void;
  runNow: (scheduleId: string, force?: boolean) => Promise<void>;
  nextRunFor: (scheduleId: string) => Date | null;
}

/**
 * Renders the schedule management panel into #app inside the plugin iframe.
 * Called when the user opens the main UI via toolbar button or command palette.
 */
export async function renderPanel(cb: PanelCallbacks): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;

  const schedules = await loadSchedules();
  root.innerHTML = panelHtml(schedules, cb.nextRunFor);

  const setFormError = (msg: string) => {
    const el = root.querySelector<HTMLElement>("#form-error");
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? "block" : "none";
    }
  };

  // Wire up handlers
  const addBtn = root.querySelector<HTMLButtonElement>("#add-schedule");
  console.log("[scheduler-ui] add-schedule button:", addBtn);
  addBtn?.addEventListener("click", async () => {
    console.log("[scheduler-ui] Add Schedule clicked");
    setFormError("");
    try {
      const entry = readForm(root, setFormError);
      if (!entry) return;
      console.log("[scheduler-ui] adding entry:", entry);
      const updated = [...(await loadSchedules()), entry];
      await saveSchedules(updated);
      await cb.onChange();
      await renderPanel(cb);
    } catch (err: any) {
      console.error("[scheduler-ui] Failed to add schedule:", err);
      setFormError(`Failed to add: ${err?.message ?? String(err)}`);
    }
  });

  root.querySelector<HTMLInputElement>("#nl-input")?.addEventListener(
    "input",
    (e) => {
      const input = (e.target as HTMLInputElement).value;
      const cronOut = root.querySelector<HTMLElement>("#cron-preview");
      if (!cronOut) return;
      try {
        cronOut.textContent = parseNaturalLanguage(input);
        cronOut.classList.remove("error");
      } catch (err: any) {
        cronOut.textContent = err.message;
        cronOut.classList.add("error");
      }
    },
  );

  root.querySelectorAll<HTMLButtonElement>(".delete-schedule").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      if (!id) return;
      const list = (await loadSchedules()).filter((s) => s.id !== id);
      await saveSchedules(list);
      await cb.onChange();
      await renderPanel(cb);
    });
  });

  const attachRunHandler = (
    selector: string,
    force: boolean,
    label: string,
  ) => {
    root.querySelectorAll<HTMLButtonElement>(selector).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (!id) return;
        btn.disabled = true;
        btn.textContent = "Running…";
        try {
          await cb.runNow(id, force);
          btn.textContent = "Done ✓";
          setTimeout(() => renderPanel(cb), 800);
        } catch (err: any) {
          console.error(`[scheduler-ui] ${label} failed:`, err);
          btn.textContent = "Failed";
          setFormError(`${label} failed: ${err?.message ?? String(err)}`);
        } finally {
          setTimeout(() => {
            btn.disabled = false;
          }, 800);
        }
      });
    });
  };
  attachRunHandler(".run-now", false, "Run Now");
  attachRunHandler(".force-run", true, "Force Run");

  root.querySelectorAll<HTMLInputElement>(".toggle-enabled").forEach((chk) => {
    chk.addEventListener("change", async () => {
      const id = chk.dataset.id;
      if (!id) return;
      const list = await loadSchedules();
      const item = list.find((s) => s.id === id);
      if (!item) return;
      item.enabled = chk.checked;
      await saveSchedules(list);
      await cb.onChange();
      await renderPanel(cb);
    });
  });

  root.querySelector<HTMLButtonElement>("#close-panel")?.addEventListener(
    "click",
    () => logseq.hideMainUI({ restoreEditingCursor: true }),
  );
}

function readForm(
  root: HTMLElement,
  setError: (msg: string) => void,
): ScheduleEntry | null {
  const label = (root.querySelector<HTMLInputElement>("#label")?.value ?? "").trim();
  const pageName = (root.querySelector<HTMLInputElement>("#page-name")?.value ?? "").trim();
  const tagsRaw = (root.querySelector<HTMLInputElement>("#tags")?.value ?? "").trim();
  const nl = (root.querySelector<HTMLInputElement>("#nl-input")?.value ?? "").trim();

  if (!label || !pageName || !nl) {
    setError("Label, page name, and schedule are required.");
    return null;
  }

  let cron: string;
  try {
    cron = parseNaturalLanguage(nl);
  } catch (err: any) {
    setError(err?.message ?? "Could not parse schedule.");
    return null;
  }

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);

  return {
    id: `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    pageName,
    tags,
    naturalLanguage: nl,
    cron,
    enabled: true,
    createdAt: Date.now(),
  };
}

function panelHtml(
  schedules: ScheduleEntry[],
  nextRunFor: (id: string) => Date | null,
): string {
  return `
    <div class="scheduler-panel">
      <header class="scheduler-header">
        <h2>Scheduler</h2>
        <button id="close-panel" class="scheduler-close">Close</button>
      </header>

      <section class="scheduler-form">
        <h3>Add a Schedule</h3>
        <label>Label <input id="label" placeholder="Personal Weekly Review" /></label>
        <label>Page Name <input id="page-name" placeholder="Weekly Review" /></label>
        <label>Tags (comma-separated) <input id="tags" placeholder="weekly-review, personal" /></label>
        <label>
          When
          <input id="nl-input" placeholder="every Saturday at 11 AM" />
          <small>Cron: <code id="cron-preview">—</code></small>
        </label>
        <div id="form-error" class="scheduler-form-error" style="display:none;"></div>
        <button id="add-schedule" type="button">Add Schedule</button>
      </section>

      <section class="scheduler-list">
        <h3>Schedules (${schedules.length})</h3>
        ${
          schedules.length === 0
            ? `<p class="scheduler-empty">No schedules yet.</p>`
            : schedules.map((s) => scheduleRow(s, nextRunFor(s.id))).join("")
        }
      </section>
    </div>
  `;
}

function scheduleRow(s: ScheduleEntry, nextRun: Date | null): string {
  const nextRunText = nextRun
    ? `${nextRun.toLocaleString()}`
    : s.enabled
      ? "not scheduled"
      : "disabled";
  return `
    <div class="scheduler-row">
      <div class="scheduler-row-main">
        <strong>${escapeHtml(s.label)}</strong>
        <div class="scheduler-row-sub">
          ${escapeHtml(s.pageName)} · ${
            s.tags.map((t) => `#${escapeHtml(t)}`).join(" ") || "<em>no tags</em>"
          }
        </div>
        <div class="scheduler-row-sub">
          <em>${escapeHtml(s.naturalLanguage)}</em> (<code>${escapeHtml(s.cron)}</code>)
        </div>
        <div class="scheduler-row-sub">
          Next fire: <strong>${escapeHtml(nextRunText)}</strong>
        </div>
      </div>
      <div class="scheduler-row-actions">
        <label><input type="checkbox" class="toggle-enabled" data-id="${s.id}" ${
          s.enabled ? "checked" : ""
        } /> Enabled</label>
        <button class="run-now" data-id="${s.id}" type="button" title="Create the page now (for testing)">Run Now</button>
        <button class="force-run" data-id="${s.id}" type="button" title="Delete existing page and recreate">Force Run</button>
        <button class="delete-schedule" data-id="${s.id}" type="button">Delete</button>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
