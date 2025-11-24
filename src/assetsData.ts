import { config, aliases } from "./icons.yml";

for (const alias in aliases) {
  for (const ext of aliases[alias]) {
    config[ext] = config[alias];
  }
}

export const assets = config;
