import * as vscode from "vscode";

export interface ToggleSettingDefinition {
  type: "toggle";
  key: string;
  label: string;
  description?: string;
  default: boolean;
}

export interface TextSettingDefinition {
  type: "text";
  key: string;
  label: string;
  description?: string;
  default: string;
  prompt: string;
}

export const TOGGLE_SETTINGS: ToggleSettingDefinition[] = [
  {
    type: "toggle",
    key: "showFile",
    label: "Show File Name",
    description: "Display the active file name",
    default: true,
  },
  {
    type: "toggle",
    key: "showLineNumbers",
    label: "Show Line & Column",
    description: "Include line and column numbers (:line:col)",
    default: true,
  },
  {
    type: "toggle",
    key: "showWorkspace",
    label: "Show Workspace Name",
    description: "Display workspace / project name in icon tooltip",
    default: true,
  },
  {
    type: "toggle",
    key: "showElapsedTime",
    label: "Show Elapsed Time",
    description: "Display timer showing elapsed editing time",
    default: true,
  },
  {
    type: "toggle",
    key: "showIdle",
    label: "Show Idle Status",
    description: "Show presence when no editor is open",
    default: true,
  },
];

export const TEXT_SETTINGS: TextSettingDefinition[] = [
  {
    type: "text",
    key: "smallImageText",
    label: "Small Image Tooltip",
    description: "Hover text for small icon",
    default: "Visual Studio Code",
    prompt: "Enter hover text for the small icon",
  },
  {
    type: "text",
    key: "idleText",
    label: "Idle Status Title",
    description: "Title shown when idle",
    default: "Idling",
    prompt: "Enter title text shown when idle (e.g. Idling, Relaxing)",
  },
];

export const CONFIG_SECTION = "discordRpc";

export const getSetting = (key: string): boolean => {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const def = TOGGLE_SETTINGS.find((s) => s.key === key);
  return config.get<boolean>(key, def ? def.default : true);
};

export const getTextSetting = (key: string): string => {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const def = TEXT_SETTINGS.find((s) => s.key === key);
  return config.get<string>(key, def ? def.default : "");
};

type TreeElement = CategoryItem | ToggleTreeItem | TextTreeItem;

class CategoryItem extends vscode.TreeItem {
  constructor(public readonly categoryId: "toggles" | "text", label: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
  }
}

export class ToggleTreeItem extends vscode.TreeItem {
  constructor(public readonly setting: ToggleSettingDefinition) {
    super(setting.label, vscode.TreeItemCollapsibleState.None);
    this.description = setting.description;
    const isChecked = getSetting(setting.key);
    this.checkboxState = isChecked
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
  }
}

export class TextTreeItem extends vscode.TreeItem {
  constructor(public readonly setting: TextSettingDefinition) {
    super(setting.label, vscode.TreeItemCollapsibleState.None);
    const val = getTextSetting(setting.key);
    this.description = `"${val}"`;
    this.tooltip = `Click to edit: ${setting.prompt}`;
    this.iconPath = new vscode.ThemeIcon("edit");
    this.command = {
      command: "discordRpc.editTextSetting",
      title: "Edit Text",
      arguments: [setting],
    };
  }
}

export class SettingsTreeDataProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): Thenable<TreeElement[]> {
    if (!element) {
      return Promise.resolve([
        new CategoryItem("toggles", "Display Toggles"),
        new CategoryItem("text", "Custom Titles & Texts"),
      ]);
    }
    if (element instanceof CategoryItem) {
      if (element.categoryId === "toggles") {
        return Promise.resolve(TOGGLE_SETTINGS.map((s) => new ToggleTreeItem(s)));
      }
      if (element.categoryId === "text") {
        return Promise.resolve(TEXT_SETTINGS.map((s) => new TextTreeItem(s)));
      }
    }
    return Promise.resolve([]);
  }
}

export const registerSettingsView = (context: vscode.ExtensionContext) => {
  const treeDataProvider = new SettingsTreeDataProvider();

  const treeView = vscode.window.createTreeView("discord-rpc-settings", {
    treeDataProvider,
    showCollapseAll: false,
  });

  treeView.onDidChangeCheckboxState(async (event) => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    for (const [item, state] of event.items) {
      if (item instanceof ToggleTreeItem) {
        const isChecked = state === vscode.TreeItemCheckboxState.Checked;
        await config.update(item.setting.key, isChecked, vscode.ConfigurationTarget.Global);
      }
    }
    treeDataProvider.refresh();
  });

  const editCommand = vscode.commands.registerCommand(
    "discordRpc.editTextSetting",
    async (setting: TextSettingDefinition) => {
      const current = getTextSetting(setting.key);
      const input = await vscode.window.showInputBox({
        title: setting.label,
        prompt: setting.prompt,
        value: current,
      });

      if (input !== undefined) {
        const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
        await config.update(setting.key, input, vscode.ConfigurationTarget.Global);
        treeDataProvider.refresh();
      }
    }
  );

  context.subscriptions.push(
    treeView,
    editCommand,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        treeDataProvider.refresh();
      }
    })
  );
};
