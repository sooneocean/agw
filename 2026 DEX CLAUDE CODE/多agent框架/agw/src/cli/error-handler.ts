export function handleCliError(err: unknown): never {
  const message = (err as Error).message;
  console.error(`Error: ${message}`);
  if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
    console.error('Daemon not started. Run: agw daemon start');
  }
  process.exit(1);
}
