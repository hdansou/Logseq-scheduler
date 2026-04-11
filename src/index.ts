import "@logseq/libs";
import { SchedulerEngine } from "./scheduler";
import { loadSchedules } from "./storage";
import { renderPanel, type PanelCallbacks } from "./ui";
import type { GlobalSettings } from "./types";

const engine = new SchedulerEngine();

const panelCallbacks: PanelCallbacks = {
  onChange: () => restart(),
  nextRunFor: (id: string) => engine.nextRunFor(id),
  async runNow(scheduleId: string, force = false) {
    const schedules = await loadSchedules();
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    await engine.fire(
      schedule,
      readGlobalSettings(),
      new Date(),
      { force },
      force ? "force" : "manual",
    );
  },
};

function detectLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function readGlobalSettings(): GlobalSettings {
  const s = (logseq.settings ?? {}) as Record<string, unknown>;
  const tz = (s.timezone as string) || detectLocalTimezone();
  return {
    timezone: tz,
    startupDelaySeconds: Number(s.startupDelaySeconds ?? 300),
  };
}

async function restart(): Promise<void> {
  const schedules = await loadSchedules();
  const settings = readGlobalSettings();
  engine.start(schedules, settings);
}

function applyThemeMode(mode: "light" | "dark"): void {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

async function syncInitialTheme(): Promise<void> {
  try {
    const cfg = await logseq.App.getUserConfigs();
    applyThemeMode(cfg?.preferredThemeMode === "dark" ? "dark" : "light");
  } catch (err) {
    console.error("[scheduler] Failed to read initial theme:", err);
  }
}

async function main() {
  console.log("[scheduler] loading");

  logseq.useSettingsSchema([
    {
      key: "timezone",
      type: "string",
      default: detectLocalTimezone(),
      title: "Timezone",
      description:
        "IANA timezone used for all schedules (e.g., `America/Chicago`, `Europe/Paris`). Defaults to your system timezone.",
    },
    {
      key: "startupDelaySeconds",
      type: "number",
      default: 0,
      title: "Startup delay (seconds)",
      description:
        "Historical: once used to delay the missed-schedule catch-up after Logseq starts. The engine now uses polling and runs catch-up immediately at startup, so this setting has no effect and will be removed in a future version.",
    },
    {
      key: "_schedulesHeading",
      type: "heading",
      default: null,
      title: "Schedules",
      description:
        "Manage schedules via the ⏰ toolbar button at the top of the Logseq window, or run the *Scheduler: Open panel* command from the command palette (Cmd/Ctrl+Shift+P).",
    },
  ]);

  // Panel styling lives in index.html (inside the plugin iframe).
  // `provideStyle` targets the Logseq main window, not the iframe, so it
  // wouldn't apply to the panel content.

  logseq.setMainUIInlineStyle({
    position: "fixed",
    zIndex: "999",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
  });

  // Toolbar button to open the panel
  logseq.App.registerUIItem("toolbar", {
    key: "scheduler-open",
    template: `
      <a class="button" data-on-click="openScheduler" title="Scheduler">
        <span style="font-size: 16px;">⏰</span>
      </a>
    `,
  });

  logseq.provideModel({
    async openScheduler() {
      await renderPanel(panelCallbacks);
      logseq.showMainUI({ autoFocus: true });
    },
  });

  // Command palette entry
  logseq.App.registerCommandPalette(
    { key: "scheduler-open", label: "Scheduler: Open panel" },
    async () => {
      await renderPanel(panelCallbacks);
      logseq.showMainUI({ autoFocus: true });
    },
  );

  // Sync the iframe's `<html>` class with Logseq's theme so the panel CSS
  // can use `html.dark` selectors. Logseq's dark mode is a CSS class on the
  // parent doc, not the OS color scheme, so prefers-color-scheme isn't enough.
  await syncInitialTheme();
  logseq.App.onThemeModeChanged(({ mode }) => applyThemeMode(mode));

  // Rebuild engine when the user-visible settings change.
  // (We also stash schedule JSON inside settings, so filter those out
  // to avoid a restart on every add/delete.)
  logseq.onSettingsChanged(async (next: any, prev: any) => {
    if (
      next?.timezone !== prev?.timezone ||
      next?.startupDelaySeconds !== prev?.startupDelaySeconds
    ) {
      await restart();
    }
  });

  // Start live schedules immediately. The engine now polls internally and
  // runs an immediate catch-up poll at start(), so missed runs are picked up
  // without a separate setTimeout block.
  await restart();

  logseq.beforeunload(async () => {
    engine.stop();
  });

  console.log("[scheduler] ready");
}

logseq.ready(main).catch(console.error);
