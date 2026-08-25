import { runAgent } from "./agent/loop";

async function main() {
  const result = await runAgent("Explain src/tools/search-files.ts");
}

main();
