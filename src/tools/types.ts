import { z } from "zod";

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  call(input: unknown): Promise<string>;
  isConcurrencySafe: boolean;
}
