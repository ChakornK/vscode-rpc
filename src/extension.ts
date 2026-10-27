import type * as vscode from "vscode";
import { log } from "./logger";
import { client } from "./activity";
import { registerSettingsView } from "./settings";

export const activate = (context: vscode.ExtensionContext) => {
  log.info("Discord Rich Presence is now active!");
  registerSettingsView(context);
};

export const deactivate = async () => {
  await client.clearActivity();
};
