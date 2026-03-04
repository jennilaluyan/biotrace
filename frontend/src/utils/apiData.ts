type DataContainer = { data?: unknown };

function hasNestedData(value: unknown): value is DataContainer {
    return typeof value === "object" && value !== null && "data" in value;
}

export function unwrapApi<T = unknown>(res: unknown): T {
    let x = hasNestedData(res) ? (res.data ?? res) : res;

    for (let i = 0; i < 5; i++) {
        if (hasNestedData(x) && x.data != null) {
            x = x.data;
            continue;
        }
        break;
    }

    return x as T;
}
