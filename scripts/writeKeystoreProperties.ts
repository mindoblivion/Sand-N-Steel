/**
 * writeKeystoreProperties.ts — writes `android/keystore.properties` for a signed Gradle build.
 *
 * Run with:  bun run scripts/writeKeystoreProperties.ts [path]
 *
 * Values arrive through the ENVIRONMENT, never argv (a command line is visible in the process
 * list to every other process on the machine):
 *
 *   KEYSTORE_STORE_FILE      keystore file name, resolved by Gradle relative to `android/`
 *   KEYSTORE_STORE_PASSWORD  the store password
 *   KEYSTORE_KEY_ALIAS       the key alias
 *   KEYSTORE_KEY_PASSWORD    the key password
 *
 * WHY THIS EXISTS — the heredoc it replaces was unsafe. The old workflow step wrote:
 *
 *     cat > android/keystore.properties <<PROPS
 *     storePassword=$KEYSTORE_PASSWORD
 *     PROPS
 *
 * With an unquoted delimiter the SHELL expanded the password into the file verbatim, so a
 * password containing a backslash, a `$`, a backtick, a newline or a leading space produced a
 * properties file that `java.util.Properties` reads as a DIFFERENT string. The failure mode is
 * quiet: Gradle either fails with "Given final block not properly padded" — which reads like a
 * corrupt keystore rather than a quoting bug — or signs with a truncated password.
 *
 * `java.util.Properties` has its own escaping rules, so the escaping below is that format's,
 * not the shell's:
 *
 *   - `\` is the escape character            -> `\\`
 *   - newline / CR / tab / form feed         -> `\n` `\r` `\t` `\f` (a raw newline ends the line)
 *   - any character outside printable ASCII  -> `\uXXXX`, because `Properties.load(InputStream)`
 *                                               decodes ISO-8859-1 and would mangle UTF-8 bytes
 *   - leading spaces in a value              -> `\ ` each, since the loader trims unescaped ones
 *
 * Nothing here is echoed: the script prints the destination path and the property COUNT, never
 * a value. The file is created mode 0600 and is git-ignored (`android/.gitignore`).
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** The four keys `android/app/build.gradle` reads out of `keystore.properties`. */
export const KEYSTORE_PROPERTY_KEYS = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'] as const;

export type KeystorePropertyKey = (typeof KEYSTORE_PROPERTY_KEYS)[number];

export interface KeystoreProperties {
  storeFile: string;
  storePassword: string;
  keyAlias: string;
  keyPassword: string;
}

/** Environment variable name for each property — the single mapping the workflow relies on. */
export const KEYSTORE_ENV_NAMES: Record<KeystorePropertyKey, string> = {
  storeFile: 'KEYSTORE_STORE_FILE',
  storePassword: 'KEYSTORE_STORE_PASSWORD',
  keyAlias: 'KEYSTORE_KEY_ALIAS',
  keyPassword: 'KEYSTORE_KEY_PASSWORD',
};

/**
 * Escape one `java.util.Properties` value.
 *
 * Walks UTF-16 code units, so an astral character is emitted as its two `\uXXXX` surrogate
 * escapes exactly as `Properties.store` would.
 */
export function escapePropertyValue(value: string): string {
  let out = '';
  let leadingSpaces = 0;
  let started = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const code = value.charCodeAt(i);

    if (!started && ch === ' ') {
      leadingSpaces += 1;
      continue;
    }
    started = true;

    if (ch === '\\') {
      out += '\\\\';
    } else if (ch === '\n') {
      out += '\\n';
    } else if (ch === '\r') {
      out += '\\r';
    } else if (ch === '\t') {
      out += '\\t';
    } else if (ch === '\f') {
      out += '\\f';
    } else if (code < 0x20 || code > 0x7e) {
      out += `\\u${code.toString(16).padStart(4, '0').toUpperCase()}`;
    } else {
      out += ch;
    }
  }

  // Only reached when the whole value was spaces.
  if (!started && leadingSpaces === 0) return '';
  return '\\ '.repeat(leadingSpaces) + out;
}

/** The exact file contents Gradle will read. One property per line, always four lines. */
export function renderKeystoreProperties(values: KeystoreProperties): string {
  return KEYSTORE_PROPERTY_KEYS.map((key) => `${key}=${escapePropertyValue(values[key])}`).join('\n') + '\n';
}

/**
 * Read the four values from an environment-like object.
 *
 * Throws naming the MISSING VARIABLE when one is absent or empty — never its value — so a
 * misconfigured secret fails loudly in the log without leaking anything.
 */
export function keystorePropertiesFromEnv(env: Record<string, string | undefined>): KeystoreProperties {
  const values: Partial<KeystoreProperties> = {};

  for (const key of KEYSTORE_PROPERTY_KEYS) {
    const envName = KEYSTORE_ENV_NAMES[key];
    const raw = env[envName];
    if (raw === undefined || raw === '') {
      throw new Error(`Missing or empty ${envName} — see docs/ANDROID_RELEASE.md.`);
    }
    values[key] = raw;
  }

  return values as KeystoreProperties;
}

/** Write the properties file at mode 0600, creating its directory if needed. */
export function writeKeystoreProperties(filePath: string, values: KeystoreProperties): void {
  const target = resolve(filePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, renderKeystoreProperties(values), { mode: 0o600 });
  // `mode` above only applies when the file is created; tighten a pre-existing file too.
  chmodSync(target, 0o600);
}

function main(argv: string[]): number {
  const target = argv[0] ?? 'android/keystore.properties';
  try {
    const values = keystorePropertiesFromEnv(process.env as Record<string, string | undefined>);
    writeKeystoreProperties(target, values);
    console.log(
      `keystore.properties written to ${target} — ${KEYSTORE_PROPERTY_KEYS.length} properties, mode 0600. No values are printed.`,
    );
    return 0;
  } catch (error) {
    console.error(`::error::${(error as Error).message}`);
    return 1;
  }
}

const isEntryPoint = (import.meta as ImportMeta & { main?: boolean }).main === true;
if (isEntryPoint) {
  process.exitCode = main(process.argv.slice(2));
}
