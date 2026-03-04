export function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}
