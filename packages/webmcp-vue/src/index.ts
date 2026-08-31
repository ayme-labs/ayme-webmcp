import { getCurrentScope, onScopeDispose } from "vue";

import { createPageRegistration } from "@ayme-dev/webmcp/internal";

type PageObjectConstructor<T extends object> = abstract new (
  ...args: never[]
) => T;

export function usePageObject<T extends object>(
  PageObjectModel: PageObjectConstructor<T>
): T {
  const registration = createPageRegistration(PageObjectModel);

  if (getCurrentScope()) {
    onScopeDispose(() => registration.dispose());
  }

  return registration.instance as T;
}
