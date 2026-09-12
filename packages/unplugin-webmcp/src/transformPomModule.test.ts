import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it, vi } from "vitest";

const { createPomProgram } = vi.hoisted(() => ({
  createPomProgram: vi.fn(),
}));

vi.mock("./pomProgram", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pomProgram")>();
  createPomProgram.mockImplementation(actual.createPomProgram);
  return { ...actual, createPomProgram };
});

import { createPomTransform } from "./transformPomModule";

it("builds one TypeScript program per POM transform", () => {
  const fixturePath = fileURLToPath(
    new URL("./fixtures/annotatedChildrenPom.ts", import.meta.url)
  );
  const source = readFileSync(fixturePath, "utf8");
  const transform = createPomTransform();

  expect(transform(source, fixturePath)).not.toBeNull();
  expect(createPomProgram).toHaveBeenCalledTimes(1);

  expect(transform(source, fixturePath)).not.toBeNull();
  expect(createPomProgram).toHaveBeenCalledTimes(2);
});
