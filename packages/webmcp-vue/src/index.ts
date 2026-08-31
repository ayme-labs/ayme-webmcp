import { getCurrentScope, onScopeDispose } from "vue";

import { createPageRegistration } from "@ayme-dev/webmcp/internal";

type PageObjectConstructor<T extends object> = abstract new (
  ...args: never[]
) => T;

export function usePageObject<T extends object>(
  PageObjectModel: PageObjectConstructor<T>
): T {
  if (!getCurrentScope()) {
    throw new Error(
      "usePageObject must be called within an active Vue effect scope"
    );
  }

  const registration = createPageRegistration(PageObjectModel);
  onScopeDispose(() => registration.dispose());

  return registration.instance as T;
}
