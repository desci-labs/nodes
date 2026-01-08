import Enquirer from "enquirer";

// Enquirer doesn't export proper types for its prompt classes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EnquirerAny = Enquirer as unknown as Record<
  string,
  new (options: unknown) => { run: () => Promise<unknown> }
>;

interface SelectChoice {
  name: string;
  message: string;
  value: string;
}

export async function select<T extends string = string>(options: {
  message: string;
  choices: SelectChoice[];
  initial?: number;
}): Promise<T> {
  const prompt = new EnquirerAny.Select({
    name: "value",
    message: options.message,
    choices: options.choices.map((c) => ({
      name: c.value,
      message: c.message,
      value: c.value,
    })),
    initial: options.initial,
  });

  return prompt.run() as Promise<T>;
}

export async function input(options: {
  message: string;
  default?: string;
  validate?: (value: string) => boolean | string;
}): Promise<string> {
  const prompt = new EnquirerAny.Input({
    name: "value",
    message: options.message,
    initial: options.default,
    validate: options.validate,
  });

  return prompt.run() as Promise<string>;
}

export async function confirm(options: {
  message: string;
  default?: boolean;
}): Promise<boolean> {
  const prompt = new EnquirerAny.Confirm({
    name: "value",
    message: options.message,
    initial: options.default,
  });

  return prompt.run() as Promise<boolean>;
}

export async function password(options: {
  message: string;
  validate?: (value: string) => boolean | string;
}): Promise<string> {
  const prompt = new EnquirerAny.Password({
    name: "value",
    message: options.message,
    validate: options.validate,
  });

  return prompt.run() as Promise<string>;
}

/**
 * Validates an Ethereum private key.
 * Accepts keys with or without 0x prefix; the remaining characters must be
 * exactly 64 hexadecimal digits (0-9, a-f, A-F).
 *
 * @param value - The private key to validate (with or without 0x prefix)
 * @returns true if valid, error message string if invalid
 */
export function validatePrivateKey(value: string): boolean | string {
  const cleaned = value.trim().startsWith("0x")
    ? value.trim().slice(2)
    : value.trim();

  if (!cleaned || cleaned.length !== 64 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    return "Please enter a valid private key (exactly 64 hex characters, with optional 0x prefix)";
  }

  return true;
}

/**
 * Normalizes an Ethereum private key by stripping leading whitespace and 0x prefix.
 * Use this before storing the key to ensure consistent format.
 *
 * @param value - The private key to normalize
 * @returns The private key without 0x prefix (64 hex characters)
 */
export function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("0x")) {
    return trimmed.slice(2);
  }
  return trimmed;
}

