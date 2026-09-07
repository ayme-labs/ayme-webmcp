type LocatorChainStep = readonly [string, readonly unknown[]];

/**
 * Formats the supported label subset shared by LocatorImpl and the fixture
 * bridge. Pinned `asLocatorDescription` first prefers a custom description;
 * this adapter keeps that precedence without introducing a second selector
 * generator beside the compiled browser artifact.
 */
export function formatLocatorDescription(
  label: string,
  description?: string
): string {
  if (description) return description;
  return label
    .replace(/^page\./, "")
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, "'$1'");
}

export function locatorDescription(description?: string): string | null {
  return description ?? null;
}

export function formatLocatorChainDescription(
  chain: readonly LocatorChainStep[],
  description?: string
): string {
  const [method, args] = chain[0] ?? [];
  if (method === "getByRole") {
    const [role, options] = args as [string, { name?: string }?];
    const label =
      options?.name === undefined
        ? `getByRole('${role}')`
        : `getByRole('${role}', { name: '${options.name}' })`;
    return formatLocatorDescription(label, description);
  }
  if (method === "locator")
    return formatLocatorDescription(`locator('${args[0]}')`, description);
  return formatLocatorDescription("locator(...)", description);
}
