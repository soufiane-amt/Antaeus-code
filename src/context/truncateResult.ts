const MAX_RESULT_CHARS = 10_000;

function truncateResult(result: string): string {
  if (result.length <= MAX_RESULT_CHARS) {
    return result;
  }
  const truncated = result.slice(0, MAX_RESULT_CHARS);
  return (
    truncated +
    `\n\n[Truncated: result was ${result.length} characters. ` +
    `Showing first ${MAX_RESULT_CHARS}.]`
  );
}
export { truncateResult };