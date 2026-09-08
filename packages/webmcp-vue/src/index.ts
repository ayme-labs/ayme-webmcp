import { getCurrentScope, onScopeDispose, readonly, ref } from "vue";

import {
  createAymeRuntime,
  createPageRegistration,
  synchronizeWebMcpTools,
  type PageObjectConstructor,
  type WebMcpRegistration,
  waitForWebMcpDriver,
} from "@ayme-dev/webmcp/internal";

declare const __AYME_WEBMCP_PUBLISH__: boolean | undefined;

export type AymeWebMcpPublicationStatus = {
  state:
    "disabled" | "waiting" | "active" | "unavailable" | "failed" | "disposed";
  message: string;
};

export type UseAymeWebMcpOptions = {
  page?: ConstructorParameters<PageObjectConstructor>[0];
};

export function useAymeWebMcp(options: UseAymeWebMcpOptions = {}) {
  if (!getCurrentScope()) {
    throw new Error(
      "useAymeWebMcp must be called within an active Vue effect scope"
    );
  }

  const runtime = createAymeRuntime(options.page);
  const publicationEnabled =
    typeof __AYME_WEBMCP_PUBLISH__ !== "undefined" && __AYME_WEBMCP_PUBLISH__;
  const publicationStatus = ref<AymeWebMcpPublicationStatus>({
    state: publicationEnabled ? "waiting" : "disabled",
    message: publicationEnabled
      ? "Waiting for the WebMCP driver."
      : "WebMCP publication is disabled.",
  });
  const controller = new AbortController();
  let disposed = false;
  let pendingPublication: Promise<void> | undefined;
  let publication: WebMcpRegistration | undefined;

  const startPublication = () => {
    if (!publicationEnabled || disposed || publication)
      return Promise.resolve();
    if (pendingPublication) return pendingPublication;

    publicationStatus.value = {
      state: "waiting",
      message: "Waiting for the WebMCP driver.",
    };
    const attempt = (async () => {
      const driver = await waitForWebMcpDriver(2_000, controller.signal);
      if (disposed) return;
      if (!driver) {
        publicationStatus.value = {
          state: "unavailable",
          message: "The WebMCP driver is unavailable.",
        };
        return;
      }

      try {
        let attemptFailed = false;
        const registration = await synchronizeWebMcpTools(driver, {
          signal: controller.signal,
          onError(error) {
            attemptFailed = true;
            if (disposed) return;
            publication = undefined;
            publicationStatus.value = failedStatus(error);
          },
        });
        if (disposed || attemptFailed) {
          registration.dispose();
          return;
        }
        publication = registration;
        publicationStatus.value = {
          state: "active",
          message: registration.message,
        };
      } catch (error) {
        if (!disposed) publicationStatus.value = failedStatus(error);
      }
    })();
    pendingPublication = attempt;
    void attempt.then(() => {
      if (pendingPublication === attempt) pendingPublication = undefined;
    });
    return attempt;
  };

  onScopeDispose(() => {
    disposed = true;
    controller.abort();
    publication?.dispose();
    runtime.dispose();
    publicationStatus.value = {
      state: "disposed",
      message: "The Ayme runtime was disposed.",
    };
  });

  if (publicationEnabled) void startPublication();

  return {
    publicationStatus: readonly(publicationStatus),
    retryPublication: startPublication,
  };
}

function failedStatus(error: unknown): AymeWebMcpPublicationStatus {
  return {
    state: "failed",
    message: `WebMCP publication failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}

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
