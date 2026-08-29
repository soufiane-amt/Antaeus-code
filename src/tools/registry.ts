import { Tool } from "./types";
import { searchFilesTool } from "./search-files";
import { readFileTool } from "./read-file";
import { listDirectoryTool } from "./list-directory";
import { writeFileTool } from "./write-file";
import { editFileTool } from "./edit-file";
import { runCommandTool } from "./run-command";
import { gitDiffTool } from "./git_diff";
import { verifyTool } from "./verify";

export const tools: Tool[] = [
  searchFilesTool,
  readFileTool,
  listDirectoryTool,
  writeFileTool,
  editFileTool,
  runCommandTool,
  gitDiffTool,
  verifyTool,
];

export function getTool(name: string) {
  return tools.find((tool) => tool.name === name);
}
