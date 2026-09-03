export function escapeForAttributeSelector(
  value: string,
  exact: boolean
): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/["]/g, '\\"')}"${exact ? "s" : "i"}`;
}

export function escapeForTextSelector(
  text: string | RegExp,
  exact: boolean
): string {
  if (typeof text !== "string") return `/${text.source}/${text.flags}`;
  return `${JSON.stringify(text)}${exact ? "s" : "i"}`;
}

export function getByRoleSelector(
  role: string,
  options: { name?: string; exact?: boolean } = {}
): string {
  const props: string[] = [];
  if (options.name !== undefined)
    props.push(
      `[name=${escapeForAttributeSelector(options.name, options.exact ?? false)}]`
    );
  return `internal:role=${role}${props.join("")}`;
}
