/* The demo shop follows the real clock. Tests pin it to noon on 23 Oct 2026 in Malaysia (the story's own
   time), so the expected numbers below never depend on the day the tests run. */
import { vi } from "vitest";

vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-23T04:00:00Z") });
