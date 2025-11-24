import * as vscode from "vscode";
import { ActivityType, Client } from "./rpc/client";
import { getAsset } from "./assets";

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
  client.setActivity(activityData);
};

const setIdle = () => {
  Object.assign(activityData, {
    assets: {
      large_image: getAsset({ name: "vscode" }),
    },
  });
  activityData.details = undefined;
  throttledSetActivity();
};
const setFile = (filePath: string, fileName: string, line: number, col: number) => {
  Object.assign(activityData, {
    details: `${fileName}:${line}:${col}`,
    assets: {
      large_image: getAsset({ fileName, filePath }),
      small_image: getAsset({ name: "vscode" }),
    },
  });
  throttledSetActivity();
};
const setNotebook = (cell: number, totalCells: number) => {
  Object.assign(activityData, {
    details: `Cell ${cell} of ${totalCells}`,
    assets: {
      large_image: getAsset({ name: "python" }),
      small_image: getAsset({ name: "vscode" }),
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

client.on("ready", () => {
  setIdle();
});
client.login();

vscode.window.onDidChangeActiveTextEditor((editor) => {
  if (!editor) {
    return;
  }
  const { document, selection } = editor;
  // Ignore notebook cells, they have their own events
  if (editor.document.uri.scheme === "vscode-notebook-cell") {
    return;
  }
  setFile(
    document.fileName.replaceAll("\\", "/") || "Untitled",
    document.fileName.split("/").pop()?.split("\\").pop() || "Untitled",
    selection.start.line + 1,
    selection.start.character + 1
  );
});
vscode.window.onDidChangeTextEditorSelection((event) => {
  const { document, selection } = event.textEditor;
  setFile(
    document.fileName.replaceAll("\\", "/") || "Untitled",
    document.fileName.split("/").pop()?.split("\\").pop() || "Untitled",
    selection.start.line + 1,
    selection.start.character + 1
  );
});

vscode.window.onDidChangeActiveNotebookEditor((editor) => {
  if (!editor) {
    return;
  }
  setNotebook(editor.selection.start + 1, editor.notebook.cellCount);
});
vscode.window.onDidChangeNotebookEditorSelection((event) => {
  const notebook = event.notebookEditor;
  setNotebook(notebook.selection.start + 1, notebook.notebook.cellCount);
});
