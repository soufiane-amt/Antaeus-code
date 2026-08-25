import fs from "fs";
import path from "path";
import { z } from "zod";
import { Tool } from "./types";

const inputSchema = z.object({
  pattern: z.string().describe("Regex pattern to search for"),
  directory: z
    .string()
    .optional()
    .describe("Directory to search. Defaults to current directory."),
});

export const searchFilesTool: Tool = {
  name: "search_files",

  description:
    "Search for a regex pattern in files recursively. Returns matching lines with file paths and line numbers.",

  inputSchema,

  async call(input) {
    const { pattern, directory } = inputSchema.parse(input);

    const dir = directory || ".";
    const regex = new RegExp(pattern);
    const results: string[] = [];

    function search(currentDir: string) {
      for (const entry of fs.readdirSync(currentDir, {
        withFileTypes: true,
      })) {
        // Skip hidden files and node_modules
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          search(fullPath);
        } else {
          try {
            const lines = fs.readFileSync(fullPath, "utf-8").split("\n");

            lines.forEach((line, index) => {
              if (regex.test(line)) {
                results.push(`${fullPath}:${index + 1}: ${line.trim()}`);
              }
            });
          } catch {
            // Ignore unreadable/binary files
          }
        }
      }
    }

    search(dir);

    return results.slice(0, 50).join("\n") || "No matches found.";
  },
};
