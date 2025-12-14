import Enquirer from "enquirer";
// Enquirer doesn't export proper types for its prompt classes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EnquirerAny = Enquirer;
export async function select(options) {
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
    return prompt.run();
}
export async function input(options) {
    const prompt = new EnquirerAny.Input({
        name: "value",
        message: options.message,
        initial: options.default,
        validate: options.validate,
    });
    return prompt.run();
}
export async function confirm(options) {
    const prompt = new EnquirerAny.Confirm({
        name: "value",
        message: options.message,
        initial: options.default,
    });
    return prompt.run();
}
export async function password(options) {
    const prompt = new EnquirerAny.Password({
        name: "value",
        message: options.message,
        validate: options.validate,
    });
    return prompt.run();
}
