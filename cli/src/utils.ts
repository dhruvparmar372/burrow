/**
 * Print an error message and exit. In JSON mode, writes structured JSON to stderr.
 */
export function exitWithError(message: string, json: boolean): never {
  if (json) {
    process.stderr.write(JSON.stringify({ error: message }) + "\n");
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}
