import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

const client = new Anthropic({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
});

export default client;
