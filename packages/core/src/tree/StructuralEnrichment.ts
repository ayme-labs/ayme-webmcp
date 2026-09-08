import type { z } from "zod";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type StructuralPropertyValue = string | readonly string[];

type StructuralEnrichmentOptions<
  T extends JsonValue,
  TProperties extends Record<string, StructuralPropertyValue>,
> = {
  key: string;
  schema: z.ZodType<T>;
  properties: {
    readonly [TKey in keyof TProperties]: (value: T) => TProperties[TKey];
  };
  hasChanged(before: T | undefined, after: T | undefined): boolean;
};

export type StructuralEnrichmentSelection<
  T extends JsonValue = JsonValue,
  TProperties extends Record<string, StructuralPropertyValue> = Record<
    string,
    StructuralPropertyValue
  >,
> = Readonly<{
  kind: StructuralEnrichmentKind<T, TProperties>;
  propertyKeys: readonly (keyof TProperties)[] | null;
}>;

export type StructuralEnrichmentKind<
  T extends JsonValue = JsonValue,
  TProperties extends Record<string, StructuralPropertyValue> = Record<
    string,
    StructuralPropertyValue
  >,
> = Readonly<{
  key: string;
  schema: z.ZodType<T>;
  hasChanged(before: T | undefined, after: T | undefined): boolean;
  properties(
    value: T,
    propertyKeys: readonly (keyof TProperties)[] | null
  ): readonly Readonly<{ key: string; value: StructuralPropertyValue }>[];
  pick<TKey extends keyof TProperties>(
    ...propertyKeys: TKey[]
  ): StructuralEnrichmentSelection<T, TProperties>;
  all(): StructuralEnrichmentSelection<T, TProperties>;
}>;

export function defineStructuralEnrichment<
  T extends JsonValue,
  TProperties extends Record<string, StructuralPropertyValue>,
>(
  options: StructuralEnrichmentOptions<T, TProperties>
): StructuralEnrichmentKind<T, TProperties> {
  const properties: Record<string, (value: T) => StructuralPropertyValue> =
    options.properties;
  const propertyEntries = Object.entries(properties);
  const select = <TKey extends keyof TProperties>(
    propertyKeys: readonly TKey[] | null
  ): StructuralEnrichmentSelection<T, TProperties> => ({ kind, propertyKeys });
  const kind: StructuralEnrichmentKind<T, TProperties> = Object.freeze({
    key: options.key,
    schema: options.schema,
    hasChanged: options.hasChanged,
    properties(value, propertyKeys) {
      const selected =
        propertyKeys === null
          ? propertyEntries
          : propertyKeys.flatMap((key) => {
              const entry = propertyEntries.find(
                ([candidate]) => candidate === key
              );
              return entry === undefined ? [] : [entry];
            });
      return selected.map(([key, selector]) => ({
        key,
        value: selector(value),
      }));
    },
    pick: (...propertyKeys) => select(Object.freeze([...propertyKeys])),
    all: () => select(null),
  });
  return kind;
}

export type StructuralEnrichmentEntry = Readonly<{
  kind: StructuralEnrichmentKind;
  value: JsonValue;
}>;
