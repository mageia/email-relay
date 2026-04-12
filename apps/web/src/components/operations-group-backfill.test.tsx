import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OperationsGroupBackfillSection from "./operations-group-backfill";

describe("OperationsGroupBackfillSection", () => {
  it("renders a card per group and wires a range form", () => {
    render(
      <OperationsGroupBackfillSection
        groups={
          [
            { id: "g1", name: "Project Team", kind: "project" },
            { id: "g2", name: "VIP", kind: "client" },
          ]
        }
        onBackfill={vi.fn(() => Promise.resolve())}
      />,
    );

    expect(screen.getByText("Project Team")).toBeInTheDocument();
    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "触发补拉" })).toHaveLength(2);
  });
});
