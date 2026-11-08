import { describe, expect, it } from "vitest";
import { getClockTextClass } from "@/app/utils/board/clockDisplay";

describe("clock warning threshold", () => {
  it.each([3000, 600, 201])("keeps %s deciseconds white", (remaining) => {
    expect(getClockTextClass(remaining)).toBe("text-white");
  });
  it.each([200, 199, 1, 0])("warns at %s deciseconds", (remaining) => {
    expect(getClockTextClass(remaining)).toBe("text-red-400");
  });
  it("keeps an unavailable time neutral", () => {
    expect(getClockTextClass()).toBe("text-white");
    expect(getClockTextClass(NaN)).toBe("text-white");
  });
});
