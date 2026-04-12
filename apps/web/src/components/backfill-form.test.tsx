import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BackfillForm from "./backfill-form";

describe("BackfillForm", () => {
  it("submits a valid date range", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<BackfillForm onSubmit={onSubmit} isSubmitting={false} />);

    fireEvent.change(screen.getByLabelText("开始日期"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.change(screen.getByLabelText("结束日期"), {
      target: { value: "2026-04-12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "触发补拉" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        rangeStart: "2026-04-01",
        rangeEnd: "2026-04-12",
      });
    });
  });

  it("blocks submit when the start date is later than the end date", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<BackfillForm onSubmit={onSubmit} isSubmitting={false} />);

    fireEvent.change(screen.getByLabelText("开始日期"), {
      target: { value: "2026-04-12" },
    });
    fireEvent.change(screen.getByLabelText("结束日期"), {
      target: { value: "2026-04-01" },
    });

    await waitFor(() => {
      expect(screen.getByText("开始日期不能晚于结束日期")).toBeInTheDocument();
    });
    expect(screen.getByText("结束日期不能早于开始日期")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "触发补拉" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "触发补拉" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks future dates and empty fields", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    render(<BackfillForm onSubmit={onSubmit} isSubmitting={false} />);

    fireEvent.change(screen.getByLabelText("开始日期"), {
      target: { value: "" },
    });

    await waitFor(() => {
      expect(screen.getByText("请选择开始日期")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("开始日期"), {
      target: { value: tomorrow },
    });
    fireEvent.change(screen.getByLabelText("结束日期"), {
      target: { value: tomorrow },
    });

    await waitFor(() => {
      expect(screen.getAllByText("日期不能晚于今天")).toHaveLength(2);
    });
    expect(screen.getByRole("button", { name: "触发补拉" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "触发补拉" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
