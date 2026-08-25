import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { Tool } from "./types";

const inputSchema = z.object({
  directory: z
    .string()
    .optional()
    .describe("Directory to list. Defaults to current directory."),
});

export const listDirectoryTool: Tool = {
  name: "list_directory",

  description:
    "List files and directories inside a directory. Use this when you need to explore the project structure or discover what files/directories exist. Do not use this to find a specific symbol, function, class, variable, or text; use search_files instead.",
  inputSchema,

  async call(input) {
    const { directory } = inputSchema.parse(input);
    const dir = directory || ".";

    const entries = await fs.readdir(dir, {
      withFileTypes: true,
    });

    return entries
      .map((entry) => {
        const type = entry.isDirectory() ? "DIR " : "FILE";
        return `${type} ${path.join(dir, entry.name)}`;
      })
      .join("\n");
  },
};
