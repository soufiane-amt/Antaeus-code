import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

import type { Tool } from "./types";

const execAsync = promisify(exec);

const inputSchema = z.object({
  command: z
    .string()
    .describe(
      "A command that verifies whether the requested change is correct. " +
        "The command should exit with code 0 when verification succeeds.",
    ),
});

export const verifyTool: Tool = {
  name: "verify",

  description:
    "Verify that a completed change works correctly by running an appropriate " +
    "project-specific check such as tests, a build, type checking, linting, " +
    "or another executable validation command.",

  inputSchema,

  async call(input) {
    const { command } = inputSchema.parse(input);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
      });

      return [
        "Verification passed.",
        `Command: ${command}`,
        `Exit code: 0`,
        stdout ? `stdout:\n${stdout}` : "",
        stderr ? `stderr:\n${stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch (error: any) {
      return [
        "Verification failed.",
        `Command: ${command}`,
        `Exit code: ${error.code ?? "unknown"}`,
        error.stdout ? `stdout:\n${error.stdout}` : "",
        error.stderr ? `stderr:\n${error.stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  },
};
