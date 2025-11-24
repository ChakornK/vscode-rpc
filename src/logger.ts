import { window } from "vscode";

enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warning = "warning",
  Error = "error",
}
const logLevelColors = {
  [LogLevel.Debug]: "#81c8be",
  [LogLevel.Info]: "#8caaee",
  [LogLevel.Warning]: "#e5c890",
  [LogLevel.Error]: "#e78284",
};

const logChannel = window.createOutputChannel("Discord Rich Presence");

const getFormattedTimestamp = () => {
  const date = new Date();
  return ["getHours", "getMinutes", "getSeconds"]
    .map((method) => date[method as "getHours" | "getMinutes" | "getSeconds"]().toString().padStart(2, "0"))
    .join(":");
};

const logger = (logLevel: LogLevel, ...messages: unknown[]) => {
  const queue = [];
  for (const message of messages) {
    if (!!message && typeof message === "object" && !Array.isArray(message)) {
      try {
        queue.push(JSON.stringify(message, null, 2));
      } catch {
        queue.push(message);
      }
    } else {
      queue.push(message);
    }
  }

  logChannel.appendLine(`${getFormattedTimestamp()} [${logLevel}] ${queue.join(" ")}`);
  console.log(
    `%c Discord Rich Presence %c ${getFormattedTimestamp()} %c ${logLevel} `,
    "background:#5865f2;color:#fff;",
    "",
    `background:${logLevelColors[logLevel]};color:#fff;`,
    ...queue
  );
};

export const log = {
  debug: (...messages: unknown[]) => logger(LogLevel.Debug, ...messages),
  info: (...messages: unknown[]) => logger(LogLevel.Info, ...messages),
  warn: (...messages: unknown[]) => logger(LogLevel.Warning, ...messages),
  error: (...messages: unknown[]) => logger(LogLevel.Error, ...messages),
};
