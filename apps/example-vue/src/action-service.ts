export function recordAction(action: string) {
  window.__AYME_VUE_ACTIONS__.push(action);
}

export function saveDirectly() {
  recordAction("saveDirectly");
}

export function importedArchive() {
  recordAction("importedArchive");
}
