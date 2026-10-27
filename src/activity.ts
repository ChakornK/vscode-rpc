import * as vscode from "vscode";
import { ActivityType, Client } from "./rpc/client";
import { getAsset } from "./assets";
import { log } from "./logger";
import { CONFIG_SECTION, getSetting, getTextSetting } from "./settings";

interface Activity {
  state?: string;
  details?: string;
  timestamps?: {
    start?: number | Date;
    end?: number | Date;
  };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  type?: ActivityType.Playing | ActivityType.Listening | ActivityType.Watching | ActivityType.Competing;
}

const startTimestamp = Date.now();
const throttleTime = 10000; // 10 seconds
let lastActivityChangeTime = 0;
let setActivityTimer: NodeJS.Timeout;
const throttledSetActivity = () => {
  const now = Date.now();
  if (now - lastActivityChangeTime < throttleTime) {
    clearTimeout(setActivityTimer);
    setActivityTimer = setTimeout(throttledSetActivity, throttleTime + 250 - (now - lastActivityChangeTime));
    return;
  }
  lastActivityChangeTime = now;
  if (getSetting("showElapsedTime")) {
    activityData.timestamps = { start: startTimestamp };
  } else {
    activityData.timestamps = undefined;
  }
  client.setActivity(activityData);
};

const getWorkspace = () => {
  if (!getSetting("showWorkspace")) {
    return undefined;
  }
  return vscode.workspace.name ? `Workspace: ${vscode.workspace.name}`.slice(0, 128) : undefined;
};

const getSmallText = () => getTextSetting("smallImageText") || undefined;

const setIdle = () => {
  if (!getSetting("showIdle")) {
    client.clearActivity();
    return;
  }
  Object.assign(activityData, {
    details: getTextSetting("idleText") || undefined,
    assets: {
      large_image: getAsset({ name: "vscode" }),
      large_text: getWorkspace(),
      small_image: getAsset({ name: "vscode" }),
      small_text: getSmallText(),
    },
  });
  throttledSetActivity();
};
const setFile = (filePath: string, fileName: string, line: number, col: number) => {
  const showFile = getSetting("showFile");
  const showLine = getSetting("showLineNumbers");

  let details: string | undefined;
  if (showFile) {
    details = showLine ? `${fileName}:${line}:${col}` : fileName;
  }

  Object.assign(activityData, {
    details,
    assets: {
      large_image: showFile ? getAsset({ fileName, filePath }) : getAsset({ name: "vscode" }),
      large_text: getWorkspace(),
      small_image: getAsset({ name: "vscode" }),
      small_text: getSmallText(),
    },
  });
  throttledSetActivity();
};
const setNotebook = (cell: number, totalCells: number) => {
  const showFile = getSetting("showFile");
  const showLine = getSetting("showLineNumbers");

  let details: string | undefined;
  if (showFile) {
    details = showLine ? `Cell ${cell} of ${totalCells}` : "Notebook";
  }

  Object.assign(activityData, {
    details,
    assets: {
      large_image: getAsset({ name: "python" }),
      large_text: getWorkspace(),
      small_image: getAsset({ name: "vscode" }),
      small_text: getSmallText(),
    },
  });
  throttledSetActivity();
};

export const client = new Client({
  clientId: "1442327910529761351",
});
const activityData: Activity = {
  timestamps: {
    start: Date.now(),
  },
  type: ActivityType.Playing,
};

const updateActivity = () => {
  const t = vscode.window.activeTextEditor;
  if (t && t.document && t.selection && t.document.uri.scheme !== "vscode-notebook-cell") {
    return setFile(
      t.document.fileName.replaceAll("\\", "/") || "Untitled",
      t.document.fileName.split("/").pop()?.split("\\").pop() || "Untitled",
      t.selection.start.line + 1,
      t.selection.start.character + 1,
    );
  }
  const n = vscode.window.activeNotebookEditor;
  if (n && n.notebook && n.selection) {
    return setNotebook(n.selection.start + 1, n.notebook.cellCount);
  }
  return setIdle();
};

let reconnectInterval: NodeJS.Timeout;
const reconnectFreq = 10000;
const reconnect = async () => {
  log.info("Reconnecting...");
  try {
    await client.login();
  } catch {}
};
client.on("ready", () => {
  try {
    clearInterval(reconnectInterval);
  } catch {}
  log.info("Connected");
  updateActivity();
});
client.on("close", () => {
  reconnectInterval = setInterval(reconnect, reconnectFreq);
});
(async () => {
  try {
    await client.login();
  } catch {
    reconnectInterval = setInterval(reconnect, reconnectFreq);
  }
})();

vscode.window.onDidChangeActiveTextEditor(updateActivity);
vscode.window.onDidChangeTextEditorSelection(updateActivity);

vscode.window.onDidChangeActiveNotebookEditor(updateActivity);
vscode.window.onDidChangeNotebookEditorSelection(updateActivity);

vscode.workspace.onDidChangeWorkspaceFolders(updateActivity);

vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration(CONFIG_SECTION)) {
    updateActivity();
  }
});
