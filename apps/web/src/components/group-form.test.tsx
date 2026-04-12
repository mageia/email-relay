import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GroupForm from "./group-form";

describe("GroupForm", () => {
  it("submits the group name and kind", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<GroupForm onSubmit={onSubmit} isSubmitting={false} />);

    fireEvent.change(screen.getByLabelText("分组名称"), { target: { value: "客户 A" } });
    fireEvent.change(screen.getByLabelText("分组类型"), { target: { value: "client" } });
    fireEvent.click(screen.getByRole("button", { name: "保存分组" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ name: "客户 A", kind: "client", description: "" });
    });
  });
});
