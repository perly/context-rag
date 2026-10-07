import { existsSync, readFileSync } from 'node:fs';

/** Loads KEY=value lines from a dotenv file without overriding existing variables. */
export function loadEnvFile(path = '.env'): void {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;
    const separator = withoutExport.indexOf('=');
    if (separator === -1) continue;

    const key = withoutExport.slice(0, separator).trim();
    let value = withoutExport.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function requireApiKey(envPath = '.env'): string {
  loadEnvFile(envPath);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.',
    );
  }
  return apiKey;
}
