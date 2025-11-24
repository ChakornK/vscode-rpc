import fs from "node:fs";
import path from "node:path";
import net from "node:net";

import type { Client } from "./client";
import { EventEmitter } from "./events";

export enum IPC_OPERATION {
  HANDSHAKE = 0,
  FRAME = 1,
  CLOSE = 2,
  PING = 3,
  PONG = 4,
}

const pathList = [
  {
    platform: ["win32"],
    format: (id: number): string => `\\\\?\\pipe\\discord-ipc-${id}`,
  },
  // MacOS and Linux
  {
    platform: ["darwin", "linux"],
    format: (id: number): string => {
      const {
        env: { XDG_RUNTIME_DIR, TMPDIR, TMP, TEMP },
      } = process;

      const prefix = fs.realpathSync(XDG_RUNTIME_DIR ?? TMPDIR ?? TMP ?? TEMP ?? `${path.sep}tmp`);
      return path.join(prefix, `discord-ipc-${id}`);
    },
  },
  // Linux (Snap)
  {
    platform: ["linux"],
    format: (id: number): string => {
      const {
        env: { XDG_RUNTIME_DIR, TMPDIR, TMP, TEMP },
      } = process;

      const prefix = fs.realpathSync(XDG_RUNTIME_DIR ?? TMPDIR ?? TMP ?? TEMP ?? `${path.sep}tmp`);
      return path.join(prefix, "snap.discord", `discord-ipc-${id}`);
    },
  },
  // Linux (Flatpak)
  {
    platform: ["linux"],
    format: (id: number): string => {
      const {
        env: { XDG_RUNTIME_DIR, TMPDIR, TMP, TEMP },
      } = process;

      const prefix = fs.realpathSync(XDG_RUNTIME_DIR ?? TMPDIR ?? TMP ?? TEMP ?? `${path.sep}tmp`);
      return path.join(prefix, "app", "com.discordapp.Discord", `discord-ipc-${id}`);
    },
  },
];

const createSocket = async (path: string): Promise<net.Socket> => {
  return new Promise((resolve, reject) => {
    const onError = () => {
      socket.removeListener("conect", onConnect);
      reject();
    };

    const onConnect = () => {
      socket.removeListener("error", onError);
      resolve(socket);
    };

    const socket = net.createConnection(path);

    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
};

export class IpcTransport extends EventEmitter {
  client: Client;
  socket?: net.Socket;

  constructor(client: Client) {
    super();

    this.client = client;
  }

  get isConnected() {
    return this.socket !== undefined && this.socket.readyState === "open";
  }

  async getSocket(): Promise<net.Socket> {
    if (this.socket) {
      return this.socket;
    }

    for (const pat of pathList) {
      const handleSocketId = async (id: number): Promise<net.Socket | undefined> => {
        if (!pat.platform.includes(process.platform)) {
          return;
        }
        const socketPath = pat.format(id);
        if (process.platform !== "win32" && !fs.existsSync(path.dirname(socketPath))) {
          return;
        }

        const socket = await createSocket(socketPath).catch(() => undefined);
        return socket;
      };

      for (let i = 0; i < 10; i++) {
        const socket = await handleSocketId(i);
        if (socket) {
          return socket;
        }
      }
    }

    throw new Error("Could not connect");
  }

  async connect(): Promise<void> {
    if (!this.socket) {
      this.socket = await this.getSocket();
    }

    this.emit("open");

    this.send(IPC_OPERATION.HANDSHAKE, {
      v: 1,
      client_id: this.client.clientId,
    });

    this.socket.on("readable", () => {
      let data = Buffer.alloc(0);

      while (true) {
        if (!this.isConnected) {
          break;
        }

        const chunk = this.socket?.read() as Buffer | undefined;
        if (!chunk) {
          break;
        }
        this.client.emit(
          "debug",
          `SERVER => CLIENT | ${chunk
            .toString("hex")
            .match(/.{1,2}/g)
            ?.join(" ")
            .toUpperCase()}`
        );

        data = Buffer.concat([data, chunk]);
      }

      if (data.length < 8) {
        if (data.length === 0) {
          return;
        }
        this.client.emit("debug", "SERVER => CLIENT | Malformed packet, invalid payload");
        return;
      }

      const op = data.readUInt32LE(0);
      const length = data.readUInt32LE(4);

      if (data.length !== length + 8) {
        this.client.emit("debug", "SERVER => CLIENT | Malformed packet, invalid payload");
        return;
      }

      let parsedData: any;
      try {
        parsedData = JSON.parse(data.subarray(8, length + 8).toString());
      } catch {
        this.client.emit("debug", "SERVER => CLIENT | Malformed packet, invalid payload");
        return;
      }

      this.client.emit("debug", `SERVER => CLIENT | OPCODE.${IPC_OPERATION[op]} |`, parsedData);

      switch (op) {
        case IPC_OPERATION.FRAME: {
          if (!data) {
            break;
          }
          this.emit("message", parsedData);
          break;
        }
        case IPC_OPERATION.CLOSE: {
          this.emit("close", parsedData);
          break;
        }
        case IPC_OPERATION.PING: {
          this.send(IPC_OPERATION.PONG, parsedData);
          this.emit("ping");
          break;
        }
      }
    });

    this.socket.on("close", (reason) => {
      this.socket = undefined;
      this.client.emit("close", reason);
    });
  }

  send(operation: IPC_OPERATION = IPC_OPERATION.FRAME, payload?: any): void {
    this.client.emit("debug", `CLIENT => SERVER | OPCODE.${IPC_OPERATION[operation]} |`, payload);

    const dataBuffer = payload ? Buffer.from(JSON.stringify(payload)) : Buffer.alloc(0);

    const packet = Buffer.alloc(8);
    packet.writeUInt32LE(operation, 0);
    packet.writeUInt32LE(dataBuffer.length, 4);

    this.socket?.write(Buffer.concat([packet, dataBuffer]));
  }

  ping(): void {
    this.send(IPC_OPERATION.PING, crypto.randomUUID());
  }

  close(): Promise<void> {
    if (!this.socket) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      if (!this.socket) {
        return resolve();
      }

      this.socket.once("close", () => {
        this.emit("close", { code: -1, message: "Closed by client" });
        this.socket = undefined;
        resolve();
      });
      this.socket.end();
    });
  }
}
