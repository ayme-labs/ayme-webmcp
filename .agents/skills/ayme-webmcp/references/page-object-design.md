# Page object design

## Model interaction scopes

Give a distinct actionable surface a POM when it becomes the context for the
user's next interaction. Pages, menus, dialogs, drawers, and meaningful
pickers are candidates. Judge the interaction context rather than DOM keyboard
focus or Vue component boundaries.

Revealing a button or expanding explanatory text usually stays within the
current POM. A separate POM is useful when a surface has independent behavior
that makes it the next meaningful interaction context.

## Keep controls as locators

Expose individual buttons, links, and inputs as named locators. Introduce
helper objects only when they provide meaningful reusable behavior. Include
collections when the flow or structural observation needs them.

```ts
readonly createButton = this.page.locator('[data-testid="AppTopBar.createButton"]');
```

A single button does not need a PageObject wrapper merely to click it.

## Name actions by user intent

Use names that explain the action and its scope. `openCreateMenu()` communicates
the transition; `clickPlus()` describes an implementation detail. Prefer
`openDocumentCreation()` over a name tied to the current DOM structure.

## Separate helper returns from flow returns

Generic UI helpers such as Menu and Modal return `this` for chaining and
inspection, including after closing. Application POMs contain domain knowledge
and return where interaction continues.

| Action outcome                                  | Return                                     |
| ----------------------------------------------- | ------------------------------------------ |
| Interaction stays in the surface                | `this`                                     |
| Another actionable surface opens                | Destination POM                            |
| Close or cancel returns to the opener           | Owner POM                                  |
| Submission succeeds and navigates               | Resulting page POM                         |
| Expected validation failure keeps the form open | `this`                                     |
| External or terminal action                     | Explicit outcome or `void`, as appropriate |

Determine conditional returns from observed outcomes after the relevant
transition. Propagate unexpected execution failures rather than treating all
errors as validation failures.

## Pass the owner explicitly

An application component can accept its logical owner in the constructor. The
owner is the continuing interaction surface, not the DOM parent or selector
host.

```ts
class CreateDocumentModal extends ApplicationComponent {
  constructor(
    page: Page,
    readonly owner?: PageObject
  ) {
    super(page);
  }

  async close() {
    await this.modal.close();
    return this.owner;
  }
}

const creation = new CreateDocumentModal(this.page, this);
```

An optional owner makes the close result optional. Preserve that honestly;
require an owner when the flow requires one. Use constructor-based ownership
until actual differing flows require more machinery.

## Compose reusable behavior

An application menu can own a generic Menu helper and define its domain choices
and return types. Compose interaction helpers instead of inheriting only to
reuse their locators.

```ts
async close() {
  await this.menu.close();
  return this.owner;
}
```

Reuse destination POMs after checking their scope and runtime dependencies. An
existing test POM is not automatically browser-compatible.

## Illustrate a coherent journey

Show a short usage example when it helps assess a proposed API. This is a
design aid, not a required test or an approval gate for every change.

```ts
const menu = await topBar.openCreateMenu();
const creation = await menu.openDocumentCreation();
await creation.fillDocumentName("Supplier agreement");
const result = await creation.create();
// Result is the observed destination or the form with validation errors.
```

Show alternate outcomes separately instead of continuing to choose items from
an already-closed menu. During prototyping, label proposed behavior separately
from behavior that has been implemented and observed.
