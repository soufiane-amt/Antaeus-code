import { Tool } from "./types";
import { searchFilesTool } from "./search-files";
import { readFileTool } from "./read-file";
import { listDirectoryTool } from "./list-directory";
import { write } from "node:fs";
import { writeFileTool } from "./write-file";
import { editFileTool } from "./edit-file";

export const tools: Tool[] = [
  searchFilesTool,
  readFileTool,
  listDirectoryTool,
  writeFileTool,
  editFileTool,
];

export function getTool(name: string) {
  return tools.find((tool) => tool.name === name);
}
