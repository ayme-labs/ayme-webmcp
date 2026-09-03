#!/usr/bin/env node
/**
 * Manages the upstream compatibility baseline.
 *
 * Commands:
 *   check   verify corpus integrity → run tests → gate against baseline
 *   update  verify corpus integrity → run tests → promote to baseline
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { harnessUnsupportedReason } from "../tests/upstream/harness-policy.mjs";
import { corpus, specNames } from "../tests/upstream/corpus.ts";
import { verifyIntegrity } from "./upstream-specs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(PKG_ROOT, "test-results/report.json");
const BASELINE_PATH = resolve(PKG_ROOT, "tests/upstream/baseline.json");

// ── Report parsing ──────────────────────────────────────────────────

/**
 * Parse a Playwright JSON report into a flat list of test entries.
 * Each entry: { id, status, harnessUnsupported, reason, file }
 *
 * Stable ID: "specFilename > full test title"
 */
export function parseReport(report) {
  const entries = [];

  function walkSuite(suite, titlePath) {
    for (const child of suite.suites ?? []) {
      walkSuite(child, [...titlePath, child.title]);
    }
    for (const spec of suite.specs ?? []) {
      const fullTitle = [...titlePath, spec.title].filter(Boolean).join(" > ");

      for (const test of spec.tests ?? []) {
        const result = test.results?.[0];
        if (!result) continue;

        const file = spec.file ?? suite.file ?? "";
        const filename = file.split("/").pop() ?? file;

        const harnessAnnotation =
          (test.annotations ?? []).find(
            (a) => a.type === "harness-unsupported"
          ) ??
          (result.annotations ?? []).find(
            (a) => a.type === "harness-unsupported"
          );

        // Fallback: check shared policy when Playwright doesn't
        // serialize the annotation (observed for @smoke-tagged tests).
        const policyReason = harnessUnsupportedReason(filename);
        const isHU = !!harnessAnnotation || !!policyReason;

        entries.push({
          id: `${filename} > ${fullTitle}`,
          status: result.status,
          harnessUnsupported: isHU,
          reason: harnessAnnotation?.description ?? policyReason ?? null,
          file: filename,
        });
      }
    }
  }

  for (const suite of report.suites ?? []) {
    walkSuite(suite, []);
  }

  return entries;
}

// ── Report-level error validation ────────────────────────────────────

/**
 * Reject reports with non-empty top-level `errors` (collection/runner
 * failures that prevent trustworthy results).
 * Returns an array of error message strings (empty = OK).
 */
export function validateReportErrors(report) {
  const errors = report.errors ?? [];
  return errors.map(
    (e) => e.message?.split("\n")[0] ?? "unknown collection error"
  );
}

// ── Completeness validation ─────────────────────────────────────────

/**
 * Validate that the report covers every corpus spec, IDs are unique,
 * and counts match.
 *
 * @param {Array} entries  Parsed test entries.
 * @param {readonly string[]} names  Corpus spec filenames.
 */
export function validateCompleteness(entries, names) {
  const corpusSpecs = new Set(names);
  const corpusEntries = entries.filter((e) => corpusSpecs.has(e.file));
  const errors = [];

  // Every corpus spec must appear
  const presentSpecs = new Set(corpusEntries.map((e) => e.file));
  for (const spec of corpusSpecs) {
    if (!presentSpecs.has(spec)) {
      errors.push(`Missing corpus spec in report: ${spec}`);
    }
  }

  // Stable IDs must be unique
  const ids = corpusEntries.map((e) => e.id);
  const idSet = new Set(ids);
  if (ids.length !== idSet.size) {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    errors.push(`Duplicate stable IDs: ${[...new Set(dupes)].join(", ")}`);
  }

  return {
    errors,
    specCount: presentSpecs.size,
    testCount: corpusEntries.length,
  };
}

// ── Comparison ──────────────────────────────────────────────────────

/**
 * Compare current results against a recorded baseline.
 *
 * @param {Array} entries  Parsed test entries.
 * @param {{ passingIds: string[] }} baseline  Recorded baseline.
 * @param {readonly string[]} names  Corpus spec filenames.
 */
export function compareBaseline(entries, baseline, names) {
  const baselineSet = new Set(baseline.passingIds);
  const corpusSpecs = new Set(names);
  const corpusEntries = entries.filter((e) => corpusSpecs.has(e.file));

  const passed = corpusEntries.filter(
    (e) => e.status === "passed" && !e.harnessUnsupported
  );
  const passedIds = new Set(passed.map((e) => e.id));

  const hu = corpusEntries.filter((e) => e.harnessUnsupported);
  const skipped = corpusEntries.filter(
    (e) => e.status === "skipped" && !e.harnessUnsupported
  );
  const failed = corpusEntries.filter(
    (e) =>
      e.status !== "passed" && e.status !== "skipped" && !e.harnessUnsupported
  );

  const regressions = [...baselineSet].filter((id) => !passedIds.has(id));
  const newlyPassing = passed
    .filter((e) => !baselineSet.has(e.id))
    .map((e) => e.id);

  return {
    regressions: regressions.sort(),
    newlyPassing: newlyPassing.sort(),
    baselinePassing: baselineSet.size,
    currentPassing: passed.map((e) => e.id).sort(),
    failed: failed.length,
    skipped: skipped.length,
    harnessUnsupported: hu.length,
    total: corpusEntries.length,
  };
}

// ── Clustering ──────────────────────────────────────────────────────

function clusterFailures(entries, corpusSpecs) {
  const failures = entries.filter(
    (e) =>
      corpusSpecs.has(e.file) &&
      e.status !== "passed" &&
      e.status !== "skipped" &&
      !e.harnessUnsupported
  );
  const byFile = new Map();
  for (const e of failures) {
    byFile.set(e.file, (byFile.get(e.file) ?? 0) + 1);
  }
  return [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([file, count]) => `  ${file}: ${count} failures`);
}

function huSummary(entries, corpusSpecs) {
  const hu = entries.filter(
    (e) => corpusSpecs.has(e.file) && e.harnessUnsupported
  );
  const byReason = new Map();
  for (const e of hu) {
    const r = e.reason ?? "unknown";
    if (!byReason.has(r)) byReason.set(r, []);
    byReason.get(r).push(e.file);
  }
  return [...byReason.entries()].map(([reason, files]) => {
    const unique = [...new Set(files)];
    return `  ${reason}\n    files: ${unique.join(", ")} (${files.length} tests)`;
  });
}

// ── Corpus integrity ────────────────────────────────────────────────

/**
 * Verify corpus integrity (spec file hashes).
 * Exits with the given code on failure.
 */
function requireCorpusIntegrity(exitCode) {
  console.log("Verifying corpus integrity…");
  const { drifted, missing } = verifyIntegrity();
  if (drifted > 0 || missing > 0) {
    console.error(
      `\nERROR: Corpus integrity check failed (${drifted} drifted, ${missing} missing).`
    );
    console.error("Run `upstream:sync` to refresh spec files.");
    process.exit(exitCode);
  }
  console.log("Corpus integrity verified.\n");
}

// ── Corpus runner ───────────────────────────────────────────────────

function resolvePlaywrightCli() {
  const req = createRequire(resolve(PKG_ROOT, "package.json"));
  return req.resolve("@playwright/test/cli");
}

/**
 * Run the corpus.  Tolerates Playwright's ordinary test-failure exit
 * (code 1) but fails on spawn errors, signals, missing/malformed
 * reports, and incomplete corpus.
 */
function runCorpus() {
  const specGlobs = specNames.map((s) => `tests/upstream/${s}`);
  const cli = resolvePlaywrightCli();

  // Delete old report so we can detect generation failure.
  if (existsSync(REPORT_PATH)) unlinkSync(REPORT_PATH);

  const args = [
    cli,
    "test",
    "--reporter=list,json",
    "--timeout=30000",
    ...specGlobs,
  ];

  let exitCode;
  try {
    execFileSync(process.execPath, args, {
      cwd: PKG_ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_NAME: REPORT_PATH,
      },
    });
    exitCode = 0;
  } catch (err) {
    if (err.status != null) {
      exitCode = err.status;
    } else {
      console.error("ERROR: Playwright process failed to start or was killed.");
      if (err.signal) console.error(`Signal: ${err.signal}`);
      process.exit(2);
    }
  }

  // Only 0 (all passed) and 1 (some tests failed) are expected.
  // Any other status is a runner/config error.
  if (exitCode !== 0 && exitCode !== 1) {
    console.error(
      `ERROR: Playwright exited with unexpected status ${exitCode} (runner/config failure).`
    );
    process.exit(2);
  }

  // Validate report was created
  if (!existsSync(REPORT_PATH)) {
    console.error(
      `ERROR: Report not generated at ${REPORT_PATH} (exit code ${exitCode}).`
    );
    process.exit(2);
  }

  const report = loadAndValidateReport(REPORT_PATH, 2);

  console.log(
    `Corpus: ${report.specCount} specs, ${report.testCount} tests (Playwright exit ${exitCode})`
  );
  return report.entries;
}

// ── Commands ────────────────────────────────────────────────────────

/**
 * Parse, validate report errors, and validate completeness.
 */
function loadAndValidateReport(path, exitCodeOnFailure) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.error("ERROR: Report is malformed JSON.");
    process.exit(exitCodeOnFailure);
  }

  // Reject collection/runner errors
  const reportErrors = validateReportErrors(raw);
  if (reportErrors.length > 0) {
    console.error("ERROR: Report contains collection/runner errors:");
    for (const e of reportErrors) console.error(`  ${e}`);
    process.exit(exitCodeOnFailure);
  }

  const entries = parseReport(raw);
  const { errors, specCount, testCount } = validateCompleteness(
    entries,
    specNames
  );
  if (errors.length > 0) {
    console.error("ERROR: Report completeness validation failed:");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(exitCodeOnFailure);
  }

  return { entries, specCount, testCount };
}

function doUpdate(entries) {
  const corpusSpecs = new Set(specNames);
  const corpusEntries = entries.filter((e) => corpusSpecs.has(e.file));

  const passing = corpusEntries
    .filter((e) => e.status === "passed" && !e.harnessUnsupported)
    .map((e) => e.id)
    .sort();

  const baseline = {
    source: {
      repository: corpus.source.repository,
      commit: corpus.source.commit,
    },
    selectedTestCount: corpusEntries.length,
    passingIds: passing,
  };

  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(
    `Baseline updated: ${passing.length} passing, ${corpusEntries.length} selected tests.`
  );
}

function doCheck(entries) {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      "ERROR: No baseline found. Run `node scripts/upstream-baseline.mjs update` first."
    );
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const corpusSpecs = new Set(specNames);

  // Validate baseline provenance matches corpus
  if (
    baseline.source?.repository !== corpus.source.repository ||
    baseline.source?.commit !== corpus.source.commit
  ) {
    console.error("ERROR: Baseline source provenance does not match corpus.");
    console.error(
      `  Baseline: ${baseline.source?.repository}@${baseline.source?.commit}`
    );
    console.error(
      `  Corpus: ${corpus.source.repository}@${corpus.source.commit}`
    );
    process.exit(1);
  }

  // Validate selectedTestCount
  const corpusEntries = entries.filter((e) => corpusSpecs.has(e.file));
  if (
    baseline.selectedTestCount != null &&
    corpusEntries.length !== baseline.selectedTestCount
  ) {
    console.error(
      `ERROR: Selected test count mismatch. Baseline: ${baseline.selectedTestCount}, Report: ${corpusEntries.length}.`
    );
    process.exit(1);
  }

  const result = compareBaseline(entries, baseline, specNames);

  // Reconcile: total = passed + failed + skipped + HU
  const reconciled =
    result.currentPassing.length +
    result.failed +
    result.skipped +
    result.harnessUnsupported;

  console.log("Compatibility baseline check");
  console.log("─".repeat(40));
  console.log(`Corpus: ${result.total} tests`);
  console.log(
    `Passed: ${result.currentPassing.length} (${result.baselinePassing} baseline)`
  );
  console.log(`Failed: ${result.failed}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Harness-unsupported: ${result.harnessUnsupported}`);
  console.log(`Reconciled: ${reconciled} / ${result.total}`);
  console.log(`Newly passing: ${result.newlyPassing.length}`);
  console.log(`Regressions: ${result.regressions.length}`);

  const clusters = clusterFailures(entries, corpusSpecs);
  if (clusters.length > 0) {
    console.log("\nFailure clusters:");
    for (const line of clusters) console.log(line);
  }

  const hu = huSummary(entries, corpusSpecs);
  if (hu.length > 0) {
    console.log("\nHarness-unsupported:");
    for (const line of hu) console.log(line);
  }

  if (result.newlyPassing.length > 0) {
    console.log("\nNewly passing (promote with baseline:update):");
    for (const id of result.newlyPassing) console.log(`  + ${id}`);
  }

  if (result.regressions.length > 0) {
    console.log("\nREGRESSIONS:");
    for (const id of result.regressions) console.log(`  - ${id}`);
    process.exit(1);
  }

  if (reconciled !== result.total) {
    console.error(
      `\nERROR: Reconciliation mismatch (${reconciled} ≠ ${result.total}).`
    );
    process.exit(1);
  }

  console.log("\n✓ No regressions.");
}

// ── Main ────────────────────────────────────────────────────────────

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === new URL(process.argv[1], "file://").href;

if (isMain) {
  const command = process.argv[2];
  switch (command) {
    case "update": {
      requireCorpusIntegrity(2);
      const entries = runCorpus();
      doUpdate(entries);
      break;
    }
    case "check": {
      requireCorpusIntegrity(2);
      const entries = runCorpus();
      doCheck(entries);
      break;
    }
    default:
      console.error("Usage: upstream-baseline.mjs <check|update>");
      process.exit(1);
  }
}
