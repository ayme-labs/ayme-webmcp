import { recordAction } from "./action-service";

export function useArchive() {
  function archiveFromComposable() {
    recordAction("archiveFromComposable");
  }

  return { archiveFromComposable };
}
