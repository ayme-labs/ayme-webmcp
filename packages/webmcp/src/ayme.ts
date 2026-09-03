import { getPageStateForDocument, type PageState } from "./pageState";

export type Ayme = {
  getPageState(): Promise<PageState>;
};

export const ayme: Ayme = {
  getPageState: async () => getPageStateForDocument(requireCurrentDocument()),
};

export default ayme;

function requireCurrentDocument(): Document {
  if (typeof document === "undefined")
    throw new Error("Ayme page state requires a browser Document.");
  return document;
}
