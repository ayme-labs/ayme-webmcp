import type { BrowserLocator } from "@ayme-dev/webmcp";

import { WebMCP } from "./webmcp";

interface Locator {
  count(): Promise<number>;
}

@WebMCP
class AnnotatedComponent {
  readonly root!: BrowserLocator;
  readonly child!: BrowserLocator;
}

class DerivedComponent extends AnnotatedComponent {}

type FynkComponent<T, Selector extends string> = T & {
  readonly selector: Selector;
};

declare const createFynkComponent: <T, Selector extends string>(
  component: T,
  selector: Selector
) => FynkComponent<T, Selector>;

@WebMCP
export class AnnotatedChildrenPom {
  readonly directField!: AnnotatedComponent;

  get directGetter(): AnnotatedComponent {
    return undefined as unknown as AnnotatedComponent;
  }

  readonly directIntersection!: AnnotatedComponent & {
    readonly selector: "#direct";
  };

  readonly fynkChild = createFynkComponent(
    undefined as unknown as AnnotatedComponent,
    "#fynk"
  );

  readonly derivedChild!: DerivedComponent;
  readonly asyncField!: Promise<AnnotatedComponent>;
  readonly synchronousChildren!: AnnotatedComponent[];
  readonly mapChildren!: Map<string, AnnotatedComponent>;
  readonly setChildren!: Set<AnnotatedComponent>;
  readonly iterableChildren!: Iterable<AnnotatedComponent>;

  readonly browserLocator!: BrowserLocator;

  get locatorGetter(): Locator {
    return undefined as unknown as Locator;
  }

  get asyncGetter(): Promise<AnnotatedComponent> {
    return Promise.resolve(undefined as unknown as AnnotatedComponent);
  }

  get asyncCollectionGetter(): Promise<AnnotatedComponent[]> {
    return Promise.resolve([]);
  }

  ordinaryMethod(): AnnotatedComponent {
    return undefined as unknown as AnnotatedComponent;
  }

  locatorMethod(): Locator {
    return undefined as unknown as Locator;
  }

  async componentCollection(): Promise<AnnotatedComponent[]> {
    return [];
  }

  async parameterizedCollection(
    selector: string
  ): Promise<AnnotatedComponent[]> {
    void selector;
    return [];
  }

  synchronousCollection(): AnnotatedComponent[] {
    return [];
  }

  mapCollection(): Map<string, AnnotatedComponent> {
    return new Map();
  }

  setCollection(): Set<AnnotatedComponent> {
    return new Set();
  }

  iterableCollection(): Iterable<AnnotatedComponent> {
    return [];
  }
}
