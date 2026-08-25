import { Tool } from "./types";
import { searchFilesTool } from "./search-files";
import { readFileTool } from "./read-file";

export const tools: Tool[] = [searchFilesTool, readFileTool];

export function getTool(name: string) {
  return tools.find((tool) => tool.name === name);
}
