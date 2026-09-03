import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseReport,
  compareBaseline,
  validateCompleteness,
  validateReportErrors,
} from "./upstream-baseline.mjs";

// ── parseReport ─────────────────────────────────────────────────────

describe("parseReport", () => {
  it("extracts flat test entries with stable IDs", () => {
    const report = {
      suites: [
        {
          title: "",
          file: "tests/upstream/locator-click.spec.ts",
          suites: [],
          specs: [
            {
              title: "should click button",
              file: "tests/upstream/locator-click.spec.ts",
              tests: [{ results: [{ status: "passed", annotations: [] }] }],
            },
          ],
        },
      ],
    };

    const entries = parseReport(report);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "locator-click.spec.ts > should click button");
    assert.equal(entries[0].status, "passed");
    assert.equal(entries[0].harnessUnsupported, false);
    assert.equal(entries[0].file, "locator-click.spec.ts");
  });

  it("detects harness-unsupported annotations", () => {
    const report = {
      suites: [
        {
          title: "",
          file: "tests/upstream/page-goto.spec.ts",
          specs: [
            {
              title: "should work",
              file: "tests/upstream/page-goto.spec.ts",
              tests: [
                {
                  results: [
                    {
                      status: "passed",
                      annotations: [
                        {
                          type: "harness-unsupported",
                          description:
                            '"goto" runs through the driver allowlist',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const entries = parseReport(report);
    assert.equal(entries[0].harnessUnsupported, true);
    assert.ok(entries[0].reason.includes("goto"));
  });

  it("uses policy fallback when annotation is missing", () => {
    const report = {
      suites: [
        {
          title: "",
          file: "tests/upstream/page-goto.spec.ts",
          specs: [
            {
              title: "should work @smoke",
              file: "tests/upstream/page-goto.spec.ts",
              tests: [
                {
                  annotations: [],
                  results: [{ status: "failed", annotations: [] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const entries = parseReport(report);
    assert.equal(entries[0].harnessUnsupported, true);
  });

  it("handles nested suites in title path", () => {
    const report = {
      suites: [
        {
          title: "",
          file: "tests/upstream/foo.spec.ts",
          suites: [
            {
              title: "describe block",
              suites: [],
              specs: [
                {
                  title: "nested test",
                  file: "tests/upstream/foo.spec.ts",
                  tests: [{ results: [{ status: "failed", annotations: [] }] }],
                },
              ],
            },
          ],
          specs: [],
        },
      ],
    };

    const entries = parseReport(report);
    assert.equal(entries[0].id, "foo.spec.ts > describe block > nested test");
  });
});

// ── validateReportErrors ─────────────────────────────────────────────

describe("validateReportErrors", () => {
  it("returns empty array for report with no errors", () => {
    assert.deepEqual(validateReportErrors({ suites: [], errors: [] }), []);
  });

  it("returns empty array when errors key is missing", () => {
    assert.deepEqual(validateReportErrors({ suites: [] }), []);
  });

  it("rejects report with collection errors", () => {
    const report = {
      suites: [],
      errors: [
        {
          message:
            "Error: Cannot find module '/some/path/coreBundle'\nmore stack",
        },
      ],
    };
    const errs = validateReportErrors(report);
    assert.equal(errs.length, 1);
    assert.ok(errs[0].includes("Cannot find module"));
  });

  it("rejects report with multiple errors", () => {
    const report = {
      suites: [],
      errors: [{ message: "Error: first" }, { message: "Error: second" }],
    };
    assert.equal(validateReportErrors(report).length, 2);
  });
});

// ── validateCompleteness ────────────────────────────────────────────

describe("validateCompleteness", () => {
  const makeEntry = (file, title, status = "failed") => ({
    id: `${file} > ${title}`,
    status,
    harnessUnsupported: false,
    reason: null,
    file,
  });

  it("passes when all corpus specs are present", () => {
    const entries = [
      makeEntry("locator-click.spec.ts", "test a"),
      makeEntry("retarget.spec.ts", "test b"),
    ];
    const names = ["locator-click.spec.ts", "retarget.spec.ts"];
    const { errors, specCount, testCount } = validateCompleteness(
      entries,
      names
    );
    assert.equal(errors.length, 0);
    assert.equal(specCount, 2);
    assert.equal(testCount, 2);
  });

  it("reports missing corpus specs", () => {
    const entries = [makeEntry("locator-click.spec.ts", "test a")];
    const names = ["locator-click.spec.ts", "retarget.spec.ts"];
    const { errors } = validateCompleteness(entries, names);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("retarget.spec.ts"));
  });

  it("reports duplicate stable IDs", () => {
    const entries = [
      makeEntry("locator-click.spec.ts", "test a"),
      makeEntry("locator-click.spec.ts", "test a"),
    ];
    const names = ["locator-click.spec.ts"];
    const { errors } = validateCompleteness(entries, names);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("Duplicate"));
  });
});

// ── compareBaseline ─────────────────────────────────────────────────

describe("compareBaseline", () => {
  const makeEntry = (id, status, harnessUnsupported = false) => ({
    id,
    status,
    harnessUnsupported,
    reason: harnessUnsupported ? "stub" : null,
    file: id.split(" > ")[0],
  });

  const names = ["locator-click.spec.ts", "page-goto.spec.ts"];

  it("detects regressions when a baseline test now fails", () => {
    const entries = [
      makeEntry("locator-click.spec.ts > should click", "failed"),
      makeEntry("locator-click.spec.ts > should fill", "passed"),
    ];
    const baseline = {
      passingIds: [
        "locator-click.spec.ts > should click",
        "locator-click.spec.ts > should fill",
      ],
    };
    const result = compareBaseline(entries, baseline, names);
    assert.deepEqual(result.regressions, [
      "locator-click.spec.ts > should click",
    ]);
  });

  it("detects regressions when a baseline test disappears", () => {
    const entries = [
      makeEntry("locator-click.spec.ts > should fill", "passed"),
    ];
    const baseline = {
      passingIds: [
        "locator-click.spec.ts > should click",
        "locator-click.spec.ts > should fill",
      ],
    };
    const result = compareBaseline(entries, baseline, names);
    assert.deepEqual(result.regressions, [
      "locator-click.spec.ts > should click",
    ]);
  });

  it("surfaces newly passing tests", () => {
    const entries = [
      makeEntry("locator-click.spec.ts > should click", "passed"),
      makeEntry("locator-click.spec.ts > new test", "passed"),
    ];
    const baseline = {
      passingIds: ["locator-click.spec.ts > should click"],
    };
    const result = compareBaseline(entries, baseline, names);
    assert.deepEqual(result.regressions, []);
    assert.deepEqual(result.newlyPassing, ["locator-click.spec.ts > new test"]);
  });

  it("excludes harness-unsupported from compatibility passes", () => {
    const entries = [
      makeEntry("page-goto.spec.ts > should work", "passed", true),
      makeEntry("locator-click.spec.ts > should click", "passed"),
    ];
    const baseline = {
      passingIds: ["locator-click.spec.ts > should click"],
    };
    const result = compareBaseline(entries, baseline, names);
    assert.deepEqual(result.currentPassing, [
      "locator-click.spec.ts > should click",
    ]);
    assert.equal(result.harnessUnsupported, 1);
  });

  it("separates skipped from failed", () => {
    const entries = [
      makeEntry("locator-click.spec.ts > a", "failed"),
      makeEntry("locator-click.spec.ts > b", "skipped"),
      makeEntry("locator-click.spec.ts > c", "passed"),
    ];
    const baseline = { passingIds: [] };
    const result = compareBaseline(entries, baseline, names);
    assert.equal(result.failed, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.currentPassing.length, 1);
  });

  it("reconciles to total", () => {
    const entries = [
      makeEntry("locator-click.spec.ts > a", "passed"),
      makeEntry("locator-click.spec.ts > b", "failed"),
      makeEntry("locator-click.spec.ts > c", "skipped"),
      makeEntry("page-goto.spec.ts > d", "passed", true),
    ];
    const baseline = { passingIds: [] };
    const result = compareBaseline(entries, baseline, names);
    const reconciled =
      result.currentPassing.length +
      result.failed +
      result.skipped +
      result.harnessUnsupported;
    assert.equal(reconciled, result.total);
  });
});
