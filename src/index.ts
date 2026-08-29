import { runAgent } from "./agent/loop";

async function main() {
  const result = await runAgent("Fix the bug in hello.ts and then show me what you changed and use the `verify` tool after modifying the file .");
}

main();
