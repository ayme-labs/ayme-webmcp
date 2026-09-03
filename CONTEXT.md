# Ayme WebMCP

Ayme WebMCP exposes selected Page Object behavior as WebMCP Tools while keeping the Page Object Model as the source of that behavior.

## Language

**Page Object Model (POM)**:
A class that describes a page or a meaningful part of a page through the elements and actions it provides.

**Page Object**:
An instance of a Page Object Model. It represents one occurrence of the page or part of a page described by that model.

**Page Object Child**:
A named part of a Page Object. It may refer to one or more elements, or to one or more Page Objects.

**Page Object Action**:
A meaningful operation provided by a Page Object.

**Generated WebMCP Tool**:
A WebMCP Tool generated from a Page Object Action selected for WebMCP exposure.

**Structural Page State**:
A model-facing observation of the current page that combines its observable structure with associations to Page Objects.

**Structural Ref**:
A capture-scoped address for a node in Structural Page State. The ref itself has no identity guarantee across captures; within a Page State Session, an earlier ref may resolve to the current incarnation of a reconciled node.

**Page State Session**:
The lifetime within one browser document during which Ayme maintains best-effort continuity between successive Structural Page States.

**Page Object Root**:
The page element that anchors one Page Object instance in the observed structure.
