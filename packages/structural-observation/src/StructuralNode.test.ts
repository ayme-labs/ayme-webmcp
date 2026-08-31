import { describe, expect, it } from "vitest";
import {
  StructuralNode,
  StructuralTree,
  SyntheticAriaRefFactory,
} from "@ayme-dev/structural-observation";

function parse(yaml: string): StructuralTree {
  return StructuralTree.fromAriaSnapshotYaml(
    yaml,
    new SyntheticAriaRefFactory()
  );
}

/**
 * Parses a before/after snapshot pair with one shared factory, mirroring a real visit where the same
 * element keeps its aria ref across captures.
 */
function parsePair(
  beforeYaml: string,
  afterYaml: string
): [StructuralTree, StructuralTree] {
  const factory = new SyntheticAriaRefFactory();
  return [
    StructuralTree.fromAriaSnapshotYaml(beforeYaml, factory),
    StructuralTree.fromAriaSnapshotYaml(afterYaml, factory),
  ];
}

function expectNode(
  child: StructuralNode | string | undefined
): StructuralNode {
  expect(child).toBeDefined();
  expect(typeof child).not.toBe("string");
  return child as StructuralNode;
}

describe("StructuralNode", () => {
  describe("fromAriaSnapshotYaml", () => {
    it("parses role, name, ref, props, and mixed ordered children", () => {
      const tree = parse(
        `
- link "Documents" [active] [ref=e41] [cursor=pointer]:
  - /url: https://staging.fynk.com/documents
  - img [ref=e42]
  - generic [ref=e43]: Documents
  - text: trailing
`.trim()
      );
      const root = expectNode(tree.root);

      expect(root.role).toBe("link");
      expect(root.name).toBe("Documents");
      expect(root.ref).toBe("e41");
      expect(root.props).toEqual({ url: "https://staging.fynk.com/documents" });
      expect(root.children).toHaveLength(3);
      expect(typeof root.children[0]).not.toBe("string");
      expect(typeof root.children[1]).not.toBe("string");
      expect(root.children[2]).toBe("trailing");
    });

    it("parses built-in state flags into state and textbox values as string children", () => {
      const tree = parse(
        '- textbox "Enter document name…" [checked=mixed] [disabled] [expanded] [selected] [pressed] [level=3] [ref=e169]: my document'
      );
      const root = expectNode(tree.root);

      expect(root.role).toBe("textbox");
      expect(root.state).toEqual({
        checked: "mixed",
        disabled: true,
        expanded: true,
        active: undefined,
        selected: true,
        pressed: true,
        level: 3,
      });
      expect(root.children).toEqual(["my document"]);
    });

    it("parses cursorPointer from [cursor=pointer]", () => {
      const withPointer = expectNode(
        parse('- button "Clickable" [ref=e1] [cursor=pointer]').root
      );
      const withoutPointer = expectNode(
        parse('- button "Plain" [ref=e1]').root
      );

      expect(withPointer.cursorPointer).toBe(true);
      expect(withoutPointer.cursorPointer).toBe(false);
    });

    it("parses /url and /placeholder into props", () => {
      const tree = parse(
        `
- generic [ref=e1]:
  - textbox "Search…" [ref=e2]:
    - /placeholder: Search…
  - link "Docs" [ref=e3]:
    - /url: https://example.com/docs
`.trim()
      );
      const root = expectNode(tree.root);
      const textbox = expectNode(root.children[0]);
      const link = expectNode(root.children[1]);

      expect(textbox.props).toEqual({ placeholder: "Search…" });
      expect(link.props).toEqual({ url: "https://example.com/docs" });
    });

    it("preserves mixed child ordering with strings inline", () => {
      const tree = parse(
        `
- button "Add party" [ref=e3]:
  - img [ref=e4]
  - text: Add party
`.trim()
      );
      const button = expectNode(tree.root);

      expect(typeof button.children[0]).not.toBe("string");
      expect(button.children.at(-1)).toBe("Add party");
    });
  });

  describe("equality", () => {
    it("shallow equality ignores children and differing refs", () => {
      const before = expectNode(parse('- button "Create" [ref=e1]').root);
      const after = expectNode(
        parse('- button "Create" [ref=e2]: New child').root
      );

      expect(before.isShallowEqual(after)).toBe(true);
      expect(before.isDeepEqual(after)).toBe(false);
    });

    it("shallow identity is role + name and ignores state, props, cursorPointer, and ref", () => {
      const base = expectNode(
        parse('- button "Create" [ref=e1] [cursor=pointer]:\n  - /url: a').root
      );
      const differentState = expectNode(
        parse(
          '- button "Create" [disabled] [ref=e1] [cursor=pointer]:\n  - /url: a'
        ).root
      );
      const differentCursor = expectNode(
        parse('- button "Create" [ref=e1]:\n  - /url: a').root
      );
      const differentProps = expectNode(
        parse('- button "Create" [ref=e1] [cursor=pointer]:\n  - /url: b').root
      );
      const differentRef = expectNode(
        parse('- button "Create" [ref=e999]').root
      );

      expect(base.isShallowEqual(differentState)).toBe(true);
      expect(base.isShallowEqual(differentCursor)).toBe(true);
      expect(base.isShallowEqual(differentProps)).toBe(true);
      expect(base.isShallowEqual(differentRef)).toBe(true);
    });

    it("shallow identity distinguishes a different role or name", () => {
      const base = expectNode(parse('- button "Create" [ref=e1]').root);
      const differentRole = expectNode(parse('- link "Create" [ref=e1]').root);
      const differentName = expectNode(
        parse('- button "Delete" [ref=e1]').root
      );

      expect(base.isShallowEqual(differentRole)).toBe(false);
      expect(base.isShallowEqual(differentName)).toBe(false);
    });

    it("falls back to role + direct text for unnamed text-only leaves", () => {
      const base = expectNode(parse("- generic [ref=e1]: Documents").root);
      const sameText = expectNode(parse("- generic [ref=e2]: Documents").root);
      const differentText = expectNode(
        parse("- generic [ref=e3]: Settings").root
      );

      expect(base.isShallowEqual(sameText)).toBe(true);
      expect(base.isShallowEqual(differentText)).toBe(false);
    });

    it("does not use direct-text fallback for unnamed containers with node children", () => {
      const base = expectNode(
        parse(
          `
- generic [ref=e1]:
  - text: Heading A
  - button "Go" [ref=e2]
`.trim()
        ).root
      );
      const changedText = expectNode(
        parse(
          `
- generic [ref=e9]:
  - text: Heading B
  - button "Go" [ref=e10]
`.trim()
        ).root
      );

      expect(base.isShallowEqual(changedText)).toBe(true);
    });

    it("keeps deep equality strict about state even when shallow identity matches", () => {
      const before = expectNode(parse('- button "Back" [ref=e1]').root);
      const afterDisabled = expectNode(
        parse('- button "Back" [disabled] [ref=e2]').root
      );

      expect(before.isShallowEqual(afterDisabled)).toBe(true);
      expect(before.isDeepEqual(afterDisabled)).toBe(false);
    });

    it("deep equality additionally checks ordered children", () => {
      const before = expectNode(
        parse(
          `
- button "Add party" [ref=e1]:
  - img [ref=e2]
  - text: Add party
`.trim()
        ).root
      );
      const afterSame = expectNode(
        parse(
          `
- button "Add party" [ref=e99]:
  - img [ref=e100]
  - text: Add party
`.trim()
        ).root
      );
      const afterDifferent = expectNode(
        parse(
          `
- button "Add party" [ref=e99]:
  - text: Add party
  - img [ref=e100]
`.trim()
        ).root
      );

      expect(before.isDeepEqual(afterSame)).toBe(true);
      expect(before.isDeepEqual(afterDifferent)).toBe(false);
    });
  });

  describe("reconcile", () => {
    it("preserves ids and marks deep-equal nodes unchanged", () => {
      const before = parse('- button "Create" [ref=e1]');
      const after = parse('- button "Create" [ref=e1]');

      const reconciled = expectNode(
        StructuralTree.reconcile(before, after).root
      );
      const beforeNode = expectNode(before.root);

      expect(reconciled.ref).toBe(beforeNode.ref);
      expect(reconciled.status).toEqual({ kind: "unchanged" });
    });

    it("preserves ids and marks shallow-equal nodes updated", () => {
      const before = parse('- button "Create" [ref=e1]');
      const after = parse('- button "Create" [ref=e9]: now');

      const reconciledTree = StructuralTree.reconcile(before, after);
      const reconciled = expectNode(reconciledTree.root);

      expect(reconciled.status).toEqual({
        kind: "updated",
        selfChanged: true,
        childListChanged: false,
      });
      expect(reconciled.ref).toBe(after.root.ref);
      expect(reconciled.children).toEqual(["now"]);
    });

    it("marks unmatched new nodes added and unmatched old nodes removed in context", () => {
      const [before, after] = parsePair(
        `
- generic [ref=e1]:
  - button "Old" [ref=e2]
  - button "Shared" [ref=e3]
`.trim(),
        `
- generic [ref=e1]:
  - button "Shared" [ref=e3]
  - button "New" [ref=e4]
`.trim()
      );

      const reconciled = expectNode(
        StructuralTree.reconcile(before, after).root
      );

      expect(reconciled.status).toEqual({
        kind: "updated",
        selfChanged: false,
        childListChanged: true,
      });
      const nodeChildren = reconciled.children.filter(
        (child): child is StructuralNode => typeof child !== "string"
      );
      expect(
        nodeChildren.map((child) => `${child.name}:${child.status?.kind}`)
      ).toEqual(["Old:removed", "Shared:unchanged", "New:added"]);
    });

    it("does not mark ancestors changed when only a deeper matched node changes", () => {
      const [before, after] = parsePair(
        '- generic [ref=e1]:\n  - generic [ref=e2]:\n    - button "Save" [ref=e3]',
        '- generic [ref=e1]:\n  - generic [ref=e2]:\n    - button "Save" [disabled] [ref=e3]'
      );

      const root = expectNode(StructuralTree.reconcile(before, after).root);
      const container = expectNode(root.children[0]);
      const button = expectNode(container.children[0]);

      expect(root.status).toEqual({ kind: "unchanged" });
      expect(container.status).toEqual({ kind: "unchanged" });
      expect(button.status).toEqual({
        kind: "updated",
        selfChanged: true,
        childListChanged: false,
      });
    });

    it("keeps removed nodes attached in the reconciled structure", () => {
      const [before, after] = parsePair(
        `
- generic [ref=e1]:
  - button "Old" [ref=e2]
  - button "Shared" [ref=e3]
`.trim(),
        `
- generic [ref=e1]:
  - button "Shared" [ref=e3]
`.trim()
      );

      const reconciled = expectNode(
        StructuralTree.reconcile(before, after).root
      );
      const removed = reconciled.children
        .filter((child): child is StructuralNode => typeof child !== "string")
        .filter((child) => child.status?.kind === "removed");

      expect(removed.map((child) => child.name)).toEqual(["Old"]);
    });

    it("does not force-match ambiguous repeated siblings", () => {
      const [before, after] = parsePair(
        `
- generic [ref=e1]:
  - button "Duplicate" [ref=e2]
  - button "Duplicate" [ref=e3]
`.trim(),
        `
- generic [ref=e1]:
  - button "Duplicate" [ref=e5]
`.trim()
      );

      const reconciled = expectNode(
        StructuralTree.reconcile(before, after).root
      );

      const nodeChildren = reconciled.children.filter(
        (child): child is StructuralNode => typeof child !== "string"
      );
      expect(nodeChildren.map((child) => child.status?.kind)).toEqual([
        "added",
        "removed",
        "removed",
      ]);
    });
  });

  describe("reconcile with looser identity", () => {
    function reconcileSingleChild(
      beforeYaml: string,
      afterYaml: string
    ): StructuralNode {
      const before = parse(`- generic [ref=e1]:\n  ${beforeYaml}`);
      const after = parse(`- generic [ref=e9]:\n  ${afterYaml}`);
      const root = expectNode(StructuralTree.reconcile(before, after).root);
      return expectNode(root.children[0]);
    }

    it("treats a newly disabled control with stable role and name as changed", () => {
      const child = reconcileSingleChild(
        '- button "Back" [ref=e2]',
        '- button "Back" [disabled] [ref=e10]'
      );

      expect(child.status).toEqual({
        kind: "updated",
        selfChanged: true,
        childListChanged: false,
      });
    });

    it("treats a props-only change with stable role and name as changed", () => {
      const child = reconcileSingleChild(
        '- link "Docs" [ref=e2]:\n    - /url: https://example.com/a',
        '- link "Docs" [ref=e10]:\n    - /url: https://example.com/b'
      );

      expect(child.status).toEqual({
        kind: "updated",
        selfChanged: true,
        childListChanged: false,
      });
    });

    it("treats a cursor-only change with stable role and name as changed", () => {
      const child = reconcileSingleChild(
        '- button "Save" [ref=e2]',
        '- button "Save" [ref=e10] [cursor=pointer]'
      );

      expect(child.status).toEqual({
        kind: "updated",
        selfChanged: true,
        childListChanged: false,
      });
    });

    it("treats a changed textbox value with stable role and name as changed", () => {
      const child = reconcileSingleChild(
        '- textbox "Document name" [ref=e2]: draft',
        '- textbox "Document name" [ref=e10]: final'
      );

      expect(child.status).toEqual({
        kind: "updated",
        selfChanged: true,
        childListChanged: false,
      });
      expect(child.children).toEqual(["final"]);
    });

    it("treats a materially changed name as remove plus add", () => {
      const [before, after] = parsePair(
        '- generic [ref=e1]:\n  - button "Create document" [ref=e2]',
        '- generic [ref=e1]:\n  - button "Please wait…" [ref=e3]'
      );

      const root = expectNode(StructuralTree.reconcile(before, after).root);
      const nodeChildren = root.children.filter(
        (child): child is StructuralNode => typeof child !== "string"
      );

      expect(
        nodeChildren.map((child) => `${child.name}:${child.status?.kind}`)
      ).toEqual(["Please wait…:added", "Create document:removed"]);
    });

    it("detects text moving across a structural child as selfChanged", () => {
      const [before, after] = parsePair(
        '- generic [ref=e1]:\n  - text: Label\n  - button "Go" [ref=e2]',
        '- generic [ref=e1]:\n  - button "Go" [ref=e2]\n  - text: Label'
      );

      const root = expectNode(StructuralTree.reconcile(before, after).root);
      expect(root.status?.kind).toBe("updated");
      expect(root.status).toMatchObject({ selfChanged: true });
    });
  });
});
