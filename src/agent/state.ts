export interface AgentState {
  iteration: number;
  toolCalls: number;
  completed: boolean;
  lastTool?: string;
}

export const MAX_ITERATIONS = 30;
export const MAX_TOOL_CALLS = 50;

export type TaskState = {
  modifiedFiles: string[];
  verificationRequired: boolean;
  verificationPassed: boolean;
  verificationCommand?: string;
};

export function createTaskState(): TaskState {
  return {
    modifiedFiles: [],
    verificationRequired: false,
    verificationPassed: false,
  };
}