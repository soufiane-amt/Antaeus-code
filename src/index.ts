import { runAgent } from "./agent/loop";

async function main() {
  const result = await runAgent(
    "Change Hello from Hello from Qwen. to my coding agent. in test-agent.txt.",
  );
}

main();
