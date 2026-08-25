import fs from "fs/promises";
import { z } from "zod";
import { Tool } from "./types";

const inputSchema = z.object({
  path: z.string().describe("Path of the file to edit"),

  oldText: z.string().describe("Exact text that should be replaced"),

  newText: z.string().describe("Text that should replace oldText"),
});

export const editFileTool: Tool = {
  name: "edit_file",

  description:
    "Edit an existing file by replacing an exact piece of text. The oldText must exist exactly in the file.",

  inputSchema,

  async call(input) {
    const { path: filePath, oldText, newText } = inputSchema.parse(input);

    const content = await fs.readFile(filePath, "utf-8");

    if (!content.includes(oldText)) {
      return `Error: oldText was not found in ${filePath}`;
    }

    const occurrences = content.split(oldText).length - 1;

    if (occurrences > 1) {
      return `Error: oldText appears ${occurrences} times in ${filePath}. The edit must uniquely identify the text.`;
    }

    const updatedContent = content.replace(oldText, newText);

    await fs.writeFile(filePath, updatedContent, "utf-8");

    return `Successfully edited file: ${filePath}`;
  },
};
