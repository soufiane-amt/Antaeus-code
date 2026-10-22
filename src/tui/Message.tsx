import React from "react";
import { Box, Text } from "ink";
import { Markdown } from "./Markdown";
import { theme } from "./theme";

export function UserMessage({ text }: { text: string }) {
  return (
    <Box marginTop={1}>
      <Text backgroundColor={theme.userBg}>
        <Text color={theme.user} bold>
          {" ❯ "}
        </Text>
        <Text color="#F4F4F5">{text} </Text>
      </Text>
    </Box>
  );
}

export function AssistantMessage({ text }: { text: string }) {
  return (
    <Box marginTop={1} flexDirection="row">
      <Box width={2} flexShrink={0}>
        <Text color={theme.accent2}>●</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Markdown text={text} />
      </Box>
    </Box>
  );
}

export function InfoMessage({ text }: { text: string }) {
  return (
    <Box marginTop={1}>
      <Text color={theme.muted}>
        <Text color={theme.accent}>◆ </Text>
        {text}
      </Text>
    </Box>
  );
}

export function WarningMessage({ text }: { text: string }) {
  return (
    <Box marginTop={1}>
      <Text color={theme.warning}>⚠ {text}</Text>
    </Box>
  );
}

export function ErrorMessage({ text }: { text: string }) {
  return (
    <Box marginTop={1}>
      <Text color={theme.error}>✗ {text}</Text>
    </Box>
  );
}
