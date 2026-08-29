import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "./types";

const execAsync = promisify(exec);

const inputSchema = z.object({});

export const gitDiffTool: Tool = {
  name: "git_diff",

  description:
    "Show the current Git diff so you can inspect changes made to the project.",

  inputSchema,

  async call() {
    try {
      const { stdout, stderr } = await execAsync("git diff", {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });

      return stdout || stderr || "No changes detected.";
    } catch (error: any) {
      return (
        error.stdout ||
        error.stderr ||
        `Failed to get git diff: ${error.message}`
      );
    }
  },
};