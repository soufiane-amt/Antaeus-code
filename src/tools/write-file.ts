import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { Tool } from "./types";

const inputSchema = z.object({
  path: z.string().describe("Path of the file to write"),
  content: z.string().describe("Complete content to write to the file"),
});

export const writeFileTool: Tool = {
  name: "write_file",

  description:
    "Create a new file or overwrite an existing file with the provided content.",

  inputSchema,

  async call(input) {
    const { path: filePath, content } = inputSchema.parse(input);

    await fs.mkdir(path.dirname(filePath), {
      recursive: true,
    });

    await fs.writeFile(filePath, content, "utf-8");

    return `Successfully wrote file: ${filePath}`;
  },
};
