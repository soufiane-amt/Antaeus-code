import React from "react";
import { Box, Text } from "ink";
import chalk from "chalk";
import { highlight } from "cli-highlight";
import { theme } from "./theme";

type Block =
  | { kind: "text"; lines: string[] }
  | { kind: "code"; lang: string; code: string };

// Splits text into prose and fenced code blocks. An unclosed fence (while
// streaming) is treated as code that is still being written.
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let prose: string[] = [];
  let code: string[] | null = null;
  let lang = "";

  const flushProse = () => {
    if (prose.length > 0) blocks.push({ kind: "text", lines: prose });
    prose = [];
  };

  for (const line of text.split("\n")) {
    const fence = line.match(/^\s*```\s*([\w+-]*)/);

    if (fence && code === null) {
      flushProse();
      code = [];
      lang = fence[1] ?? "";
    } else if (fence && code !== null) {
      blocks.push({ kind: "code", lang, code: code.join("\n") });
      code = null;
    } else if (code !== null) {
      code.push(line);
    } else {
      prose.push(line);
    }
  }

  if (code !== null) blocks.push({ kind: "code", lang, code: code.join("\n") });
  flushProse();

  return blocks;
}

function renderInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_, c) => chalk.hex(theme.accent2)(c))
    .replace(/\*\*([^*]+)\*\*/g, (_, b) => chalk.bold(b))
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, (_, p, i) => p + chalk.italic(i))
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_, label, url) => chalk.underline(label) + chalk.hex(theme.dim)(` (${url})`),
    );
}

function renderLine(line: string): string {
  const heading = line.match(/^(#{1,6})\s+(.*)/);
  if (heading) {
    const level = heading[1]!.length;
    const content = renderInline(heading[2]!);
    return level <= 2
      ? chalk.bold.hex(theme.accent)(content)
      : chalk.bold(content);
  }

  const bullet = line.match(/^(\s*)[-*+]\s+(.*)/);
  if (bullet) {
    return `${bullet[1]}${chalk.hex(theme.accent)("•")} ${renderInline(bullet[2]!)}`;
  }

  const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)/);
  if (numbered) {
    return `${numbered[1]}${chalk.hex(theme.accent)(`${numbered[2]}.`)} ${renderInline(numbered[3]!)}`;
  }

  const quote = line.match(/^>\s?(.*)/);
  if (quote) {
    return chalk.hex(theme.dim)("│ ") + chalk.italic(renderInline(quote[1]!));
  }

  if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
    return chalk.hex(theme.border)("─".repeat(40));
  }

  return renderInline(line);
}

function highlightCode(code: string, lang: string): string {
  try {
    return highlight(code, {
      ...(lang ? { language: lang } : {}),
      ignoreIllegals: true,
    });
  } catch {
    return code;
  }
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
    >
      {lang ? <Text color={theme.dim}>{lang}</Text> : null}
      <Text>{highlightCode(code, lang)}</Text>
    </Box>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text.trim());

  return (
    <Box flexDirection="column">
      {blocks.map((block, i) =>
        block.kind === "code" ? (
          <Box key={i} marginTop={i > 0 ? 1 : 0} marginBottom={i < blocks.length - 1 ? 1 : 0}>
            <CodeBlock lang={block.lang} code={block.code} />
          </Box>
        ) : (
          <Text key={i}>
            {block.lines
              .join("\n")
              .replace(/^\n+|\n+$/g, "")
              .split("\n")
              .map(renderLine)
              .join("\n")}
          </Text>
        ),
      )}
    </Box>
  );
}
