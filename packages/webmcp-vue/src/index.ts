import { getCurrentScope, onScopeDispose } from "vue";

import {
  createPageRegistration,
  type PageObjectConstructor,
} from "@ayme-dev/webmcp/internal";

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

  return registration.instance;
}
