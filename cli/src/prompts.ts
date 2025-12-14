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

