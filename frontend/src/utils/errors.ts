export function getErrorMessage(err: any, fallback = "Something went wrong.") {
    return (
        err?.data?.message ??
        err?.data?.error ??
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.message ??
        fallback
    );
}
