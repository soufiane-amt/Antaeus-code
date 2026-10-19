#!/usr/bin/env node
// Global entry point: `antaeus` runs the agent from source in the current directory.
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { register } from "tsx/esm/api";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// A .env in the current project wins; the install's .env fills in the rest.
dotenv.config({ path: resolve(process.cwd(), ".env"), quiet: true });
dotenv.config({ path: resolve(root, ".env"), quiet: true });

register();
await import(pathToFileURL(resolve(root, "src/index.ts")).href);
