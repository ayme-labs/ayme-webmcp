import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  createRuntimeSession,
  type AymePage,
  type PageObjectConstructor,
  type RuntimeSession,
} from "@ayme-dev/webmcp/internal";

export type { AymeWebMcpPublicationStatus } from "@ayme-dev/webmcp/internal";
export type AymeWebMcpProviderProps = { page?: AymePage; children?: ReactNode };
const RuntimeContext = createContext<RuntimeSession | undefined>(undefined);

export function AymeWebMcpProvider({
  page,
  children,
}: AymeWebMcpProviderProps): ReactElement {
  const ancestor = useContext(RuntimeContext);
  const [setup] = useState(() => ({
    page,
    runtime: createRuntimeSession(page),
  }));
  if (ancestor)
    throw new Error(
      "AymeWebMcpProvider cannot be nested beneath another Ayme runtime owner."
    );
  if (page !== setup.page)
    throw new Error(
      "The provider page must stay fixed while mounted. Remount the provider to change it."
    );
  useEffect(() => setup.runtime.start(), [setup]);
  return createElement(
    RuntimeContext.Provider,
    { value: setup.runtime },
    children
  );
}

function useRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime)
    throw new Error("Ayme hooks require an ancestor AymeWebMcpProvider.");
  return runtime;
}

export function useAymeWebMcp() {
  const runtime = useRuntime();
  const publicationStatus = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  );
  return { publicationStatus, retryPublication: runtime.retryPublication };
}

function serverPageObject<T extends object>(
  model: PageObjectConstructor<T>
): T {
  const prototype = (model as unknown as { prototype: object }).prototype;
  return Object.create(prototype) as T;
}

export function usePageObject<T extends object>(
  model: PageObjectConstructor<T>
): T {
  const runtime = useRuntime();
  const [retained] = useState(() => ({
    model,
    runtime,
    instance:
      typeof window === "undefined"
        ? serverPageObject(model)
        : runtime.construct(model),
  }));
  if (retained.model !== model || retained.runtime !== runtime)
    throw new Error(
      "The Page Object model and provider must stay fixed while mounted. Remount the component to change them."
    );
  useEffect(
    () => runtime.register(model, retained.instance),
    [runtime, model, retained]
  );
  return retained.instance;
}
