import { createIsomorphicFn } from "@tanstack/react-start";

type Operation = { method: string; (...args: never[]): Promise<unknown> };
type Client<T extends Operation> = Parameters<T>[0] extends { data: undefined }
  ? (options?: { signal?: AbortSignal }) => ReturnType<T>
  : (options: Parameters<T>[0] & { signal?: AbortSignal }) => ReturnType<T>;

const invoke = createIsomorphicFn()
  .server(
    async (
      module: string,
      operation: string,
      method: string,
      data: unknown,
      _signal?: AbortSignal,
    ) => (await import("./json-registry.server")).dispatchJson(module, operation, method, data),
  )
  .client(
    async (
      module: string,
      operation: string,
      method: string,
      data: unknown,
      signal?: AbortSignal,
    ) => {
      const url = `/api/json/${module}/${operation}`;
      const response = await fetch(
        method === "GET" && data !== undefined
          ? `${url}?data=${encodeURIComponent(JSON.stringify(data))}`
          : url,
        {
          method,
          credentials: "same-origin",
          ...(signal ? { signal } : {}),
          ...(method === "POST"
            ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data ?? {}) }
            : {}),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Request failed");
      return result;
    },
  );

export function jsonClient<T extends Operation>(
  module: string,
  operation: string,
  method: "GET" | "POST",
): Client<T> {
  return ((options?: { data?: unknown; signal?: AbortSignal }) =>
    invoke(module, operation, method, options?.data, options?.signal)) as Client<T>;
}
