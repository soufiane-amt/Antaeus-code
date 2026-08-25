import { runAgent } from "./agent/loop";

async function main() {
  const result = await runAgent(
    "Read src/tools/search-files.ts and explain how the search works.",
  );
  console.log(result);
}

main();
