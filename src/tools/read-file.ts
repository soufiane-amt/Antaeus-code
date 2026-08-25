import fs from "fs/promises";
import { z } from "zod";
import { Tool } from "./types";

const inputSchema = z.object({
  path: z.string().describe("Path of the file to read"),
});

export const readFileTool: Tool = {
  name: "read_file",

  description:
    "Read the contents of a file. Returns the file contents with line numbers.",

  inputSchema,

  async call(input) {
    const { path } = inputSchema.parse(input);

    const content = await fs.readFile(path, "utf-8");

    return content
      .split("\n")
      .map((line, index) => `${index + 1}: ${line}`)
      .join("\n");
  },
};
