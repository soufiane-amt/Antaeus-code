import z from "zod";
import { Tool } from "./types";
import { htmlToMarkdown } from "../utils/utils";
import client from "../llm/openrouter";
import { config } from "../config";
import Anthropic from "@anthropic-ai/sdk";

const MAX_WEB_CONTENT = 50_000;
const urlCache = new Map<string, string>();

const webFetchTool: Tool = {
  name: "web_fetch",
  description:
    "Fetch a web page and extract content based on a prompt. " +
    "Returns the relevant content from the page.",
  inputSchema: z.object({
    url: z.string().describe("The URL to fetch"),
    prompt: z.string().describe("What to extract from the page"),
  }),
  isConcurrencySafe: true,
  async call(input) {
    const url = input.url as string;
    const prompt = input.prompt as string;

    const cached = urlCache.get(url);
    if (cached) {
      return cached;
    }

    // 1. Fetch the page
    const response = await fetch(url);
    if (!response.ok) {
      return `Error: HTTP ${response.status} ${response.statusText}`;
    }
    const html = await response.text();

    // 2. Convert HTML to markdown
    const text = htmlToMarkdown(html);

    // 3. Truncate if too long
    const truncated =
      text.length > MAX_WEB_CONTENT
        ? text.slice(0, MAX_WEB_CONTENT) + "\n[Truncated]"
        : text;

    const extraction = await client.messages.create({
      model: config.cheapModel,
      max_tokens: 2048,
      system:
        "Extract the relevant information from this web page based on the user's prompt. Be concise.",
      messages: [
        {
          role: "user",
          content: `Prompt: ${prompt}\n\nPage content:\n${truncated}`,
        },
      ],
    });

    const extractedText = extraction.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    urlCache.set(url, extractedText);
    return extractedText;
  },
};

export default webFetchTool;
