interface SelectChoice {
    name: string;
    message: string;
    value: string;
}
export declare function select<T extends string = string>(options: {
    message: string;
    choices: SelectChoice[];
    initial?: number;
}): Promise<T>;
export declare function input(options: {
    message: string;
    default?: string;
    validate?: (value: string) => boolean | string;
}): Promise<string>;
export declare function confirm(options: {
    message: string;
    default?: boolean;
}): Promise<boolean>;
export declare function password(options: {
    message: string;
    validate?: (value: string) => boolean | string;
}): Promise<string>;
export {};
