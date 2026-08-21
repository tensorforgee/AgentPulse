export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const rawMessage =
      payload &&
      typeof payload === "object" &&
      "message" in payload
        ? payload.message
        : null;
    const message =
      typeof rawMessage === "string"
        ? rawMessage
        : Array.isArray(rawMessage) &&
            rawMessage.every((item) => typeof item === "string")
          ? rawMessage.join(" ")
          : "Something went wrong. Please try again.";
    throw new Error(message);
  }

  return payload as T;
}
