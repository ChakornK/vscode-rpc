import type * as vscode from "vscode";
import { log } from "./logger";
import { client } from "./activity";

export const activate = (context: vscode.ExtensionContext) => {
  log.info("Discord Rich Presence is now active!");
};

export const deactivate = async () => {
  await client.clearActivity();
};
