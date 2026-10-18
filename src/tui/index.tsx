import React from "react";
import { render } from "ink";
import { ChatSession } from "../agent/chat";
import { resolveSession } from "../agent/session";
import { App } from "./App";

export async function startTui(startRef?: string) {
  const chat = new ChatSession();

  if (startRef) {
    const found = resolveSession(startRef);
    if (found) chat.switchTo(found.id);
    else console.log(`Session "${startRef}" not found. Starting a new one.`);
  }

  const app = render(<App chat={chat} />);
  await app.waitUntilExit();

  if (chat.messages.length > 0) {
    console.log(`\nSession saved: ${chat.id}`);
    console.log(`Resume with: npm start -- --resume ${chat.id}\n`);
  }
}
