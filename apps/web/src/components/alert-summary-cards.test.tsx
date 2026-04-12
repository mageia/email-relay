import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AlertSummaryCards from "./alert-summary-cards";

describe("AlertSummaryCards", () => {
  it("renders open alerts and stale sync counts", () => {
    render(<AlertSummaryCards summary={{ openAlerts: 3, staleMailboxes: 2, retriesQueued: 5 }} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
