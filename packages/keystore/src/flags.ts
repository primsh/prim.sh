/**
 * Shared CLI flag parsing utilities.
 *
 * argv[0] and argv[1] are reserved for the command group and subcommand and
 * are never treated as flags or flag values (loop starts at index 2).
 *
 * Supports both --flag=value and --flag value forms.
 * For --flag value, argv[i+1] is consumed only when it does not start with "--".
 * Prefer --flag=value when the value might resemble a subcommand name.
 */

export function getFlag(name: string, argv: string[]): string | undefined {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith(`--${name}=`)) return argv[i].slice(`--${name}=`.length);
    if (argv[i] === `--${name}`) {
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) return argv[i + 1];
      return ""; // boolean flag
    }
  }
  return undefined;
}

export function hasFlag(name: string, argv: string[]): boolean {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === `--${name}` || argv[i].startsWith(`--${name}=`)) return true;
  }
  return false;
}
