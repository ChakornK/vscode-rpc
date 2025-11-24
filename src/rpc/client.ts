import crypto from "node:crypto";

import { EventEmitter } from "./events";
import { IPC_OPERATION, IpcTransport } from "./ipc";

interface ClientOptions {
  clientId: string;
}

export enum ActivityType {
  /**
   * Playing {game}
   */
  Playing = 0,

  /**
   * Listening to {name}
   */
  Listening = 2,

  /**
   * Watching {details}
   */
  Watching = 3,

  /**
   * Competing in {name}
   */
  Competing = 5,
}
interface ActivityTimestamps {
  /**
   * Unix time (in milliseconds) of when the activity started
   * Must be between 0 and 2147483647000
   */
  start?: number | Date;
  /**
   * Unix time (in milliseconds) of when the activity ends
   * Must be between 0 and 2147483647000
   */
  end?: number | Date;
}
interface ActivityAssets {
  /**
   * Main icon, can be an asset name or a URL (1-128 characters)
   * If not specified, the client icon will be used
   */
  large_image?: string;

  /**
   * Hover text for the main icon (2-128 characters)
   */
  large_text?: string;

  /**
   * Small icon, can be an asset name or a URL (1-128 characters)
   */
  small_image?: string;

  /**
   * Hover text for the small icon (2-128 characters)
   */
  small_text?: string;
}
interface ActivityButton {
  /**
   * The text shown on the button (1-32 characters)
   */
  label: string;

  /**
   * The url opened when clicking the button (1-512 characters)
   */
  url: string;
}
interface Activity {
  /**
   * The player's current party status (2-128 characters)
   */
  state?: string;

  /**
   * What the player is currently doing (2-128 characters)
   */
  details?: string;

  /**
   * Create elapsed/remaining timestamps on a player's profile
   */
  timestamps?: ActivityTimestamps;

  /**
   * Assets to display on the player's profile
   */
  assets?: ActivityAssets;

  /**
   * List of interactive buttons
   */
  buttons?: ActivityButton[];

  /**
   * Default: ActivityType.Playing
   */
  type?: ActivityType.Playing | ActivityType.Listening | ActivityType.Watching | ActivityType.Competing;
}

export class Client extends EventEmitter {
  clientId: string;
  #transport: IpcTransport;

  constructor(options: ClientOptions) {
    super();

    this.clientId = options.clientId;

    this.#transport = new IpcTransport(this);
    this.#transport.on("message", (message) => {
      if (message.cmd === "DISPATCH" && message.evt === "READY") {
        this.emit("ready");
      } else {
        this.emit((message as any).evt, message.data);
      }
    });
    this.#transport.on("close", () => {
      this.emit("close");
    });
  }

  // LOGIN

  async login(): Promise<void> {
    await this.#transport.connect();
  }

  // RICH PRESENCE

  async #request(cmd: string, args?: any): Promise<any> {
    this.#transport.send(IPC_OPERATION.FRAME, {
      cmd,
      args,
      nonce: crypto.randomUUID(),
    });
  }

  async setActivity(activity: Activity, pid?: number): Promise<void> {
    const cleaned: Partial<Activity> = {};
    if (activity.state) {
      cleaned.state = activity.state;
    }
    if (activity.details) {
      cleaned.details = activity.details;
    }

    if (activity.timestamps && Object.entries(activity.timestamps).length > 0) {
      cleaned.timestamps = {};
      if (activity.timestamps?.start) {
        cleaned.timestamps.start = activity.timestamps.start;
      }
      if (activity.timestamps?.end) {
        cleaned.timestamps.end = activity.timestamps.end;
      }
    }

    if (activity.assets && Object.entries(activity.assets).length > 0) {
      cleaned.assets = {};
      if (activity.assets?.large_image) {
        cleaned.assets.large_image = activity.assets.large_image;
      }
      if (activity.assets?.large_text) {
        cleaned.assets.large_text = activity.assets.large_text;
      }
      if (activity.assets?.small_image) {
        cleaned.assets.small_image = activity.assets.small_image;
      }
      if (activity.assets?.small_text) {
        cleaned.assets.small_text = activity.assets.small_text;
      }
    }

    if (activity.buttons && activity.buttons.length > 0) {
      cleaned.buttons = [];
      for (const button of activity.buttons) {
        cleaned.buttons.push({
          label: button.label,
          url: button.url,
        });
      }
    }

    if (activity.type) {
      cleaned.type = activity.type;
      if ([ActivityType.Playing, ActivityType.Listening, ActivityType.Watching, ActivityType.Competing].includes(cleaned.type)) {
        cleaned.type = ActivityType.Playing;
      }
    }

    await this.#request("SET_ACTIVITY", {
      pid: pid ?? process ? process.pid ?? 0 : 0,
      activity,
    });
  }

  async clearActivity(pid?: number): Promise<void> {
    await this.#request("CLEAR_ACTIVITY", {
      pid: pid ?? process ? process.pid ?? 0 : 0,
    });
  }

  async destroy(): Promise<void> {
    await this.#transport.close();
  }
}
