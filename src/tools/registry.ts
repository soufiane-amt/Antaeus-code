import { Tool } from "./types";
import { searchFilesTool } from "./search-files";
import { readFileTool } from "./read-file";
import { listDirectoryTool } from "./list-directory";

export const tools: Tool[] = [searchFilesTool, readFileTool, listDirectoryTool];

export function getTool(name: string) {
  return tools.find((tool) => tool.name === name);
}
