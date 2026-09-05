import z from "zod";
import client from "../llm/openrouter";
import { Tool } from "./types";

const webSearchTool: Tool = {
  name: "web_search",
  description: "Search the web and return results with titles and URLs.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
  }),
  isConcurrencySafe: true,
  async call(input) {
    const query = input.query as string;

    // Make a separate API call with the server-side web search tool
    const response = await client.messages.create({
      model: process.env.CHEAP_MODEL || "qwen/qwen3-coder",
      max_tokens: 1024,
      system: "Perform the web search and return the results.",
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: `Search the web for: ${query}` }],
    });

    // Extract search results and text from the response
    const parts: string[] = [];
    for (const block of response.content) {
      if (block.type === "web_search_tool_result") {
        if (Array.isArray(block.content)) {
          for (const result of block.content) {
            parts.push(`- ${result.title}: ${result.url}`);
          }
        }
      } else if (block.type === "text") {
        parts.push(block.text);
      }
    }

    return parts.join("\n") || "No results found.";
  },
};

export default webSearchTool;
