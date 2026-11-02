import type { ZodType, ZodTypeDef } from "zod";

export function defineJsonOperation({ method }: { method: "GET" | "POST" }) {
  function builder<T>(schema?: ZodType<T, ZodTypeDef, unknown>) {
    return {
      validator<U>(next: ZodType<U, ZodTypeDef, unknown>) {
        return builder(next);
      },
      handler<R>(handler: (options: { data: T }) => Promise<R>) {
        return Object.assign(
          async (options: { data: T }) => {
            const data = schema ? schema.parse(options.data) : options.data;
            return handler({ data });
          },
          { method },
        );
      },
    };
  }
  return builder<undefined>();
}
