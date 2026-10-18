import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { theme } from "./theme";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ color = theme.accent }: { color?: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80);
    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{FRAMES[frame]}</Text>;
}

// "Thinking… (12s · esc to interrupt)"
export function WorkingIndicator({
  label,
  startedAt,
}: {
  label: string;
  startedAt: number;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <Text>
      <Spinner /> <Text color={theme.accent}>{label}…</Text>
      <Text color={theme.dim}> ({seconds}s · esc to interrupt)</Text>
    </Text>
  );
}
