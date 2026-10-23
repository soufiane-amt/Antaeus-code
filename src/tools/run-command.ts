import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { config } from "../config";
import type { Tool } from "./types";

const execAsync = promisify(exec);

const inputSchema = z.object({
  command: z.string().describe("The shell command to execute"),
});

export const runCommandTool: Tool = {
  name: "run_command",

  description:
    "Execute a shell command in the project directory and return its output.",

  inputSchema,

  async call(input) {
    const { command } = inputSchema.parse(input);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: config.commandTimeoutSeconds * 1000,
        maxBuffer: 1024 * 1024,
      });

      return [
        stdout && `STDOUT:\n${stdout}`,
        stderr && `STDERR:\n${stderr}`,
      ]
        .filter(Boolean)
        .join("\n") || "Command completed successfully.";
    } catch (error: any) {
      return [
        `Command failed with exit code ${error.code ?? "unknown"}`,
        error.stdout && `STDOUT:\n${error.stdout}`,
        error.stderr && `STDERR:\n${error.stderr}`,
        error.killed && "Command was terminated because it timed out.",
      ]
        .filter(Boolean)
        .join("\n");
    }
  },
};