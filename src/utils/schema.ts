import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import Anthropic from "@anthropic-ai/sdk";

export function toJsonSchema(schema: z.ZodType) {
  return zodToJsonSchema(schema) as Anthropic.Tool.InputSchema;
}
