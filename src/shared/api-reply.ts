// Reading the replies of the app's own API (src/app/api/) in the browser.

// A reply's JSON body, or null when it isn't JSON. The app's API decides the
// shape, so the caller states it as T instead of checking every field.
export async function readJson<T>(response: Response): Promise<T | null> {
    try {
        return (await response.json()) as T;
    } catch {
        return null;
    }
}

// What an error reply says: the API answers errors with { message: "..." }.
// null when the reply has no message, such as a proxy's HTML error page.
export async function replyError(response: Response): Promise<string | null> {
    const body = await readJson<{ message?: unknown }>(response);
    return typeof body?.message === 'string' ? body.message : null;
}
