import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GmailLabelSelector from "./gmail-label-selector";

describe("GmailLabelSelector", () => {
  it("allows toggling folders and submits the selected ids", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <GmailLabelSelector
        title="同步标签"
        labels={[
          { id: "INBOX", name: "Inbox", kind: "system", selected: true },
          { id: "STARRED", name: "Starred", kind: "system", selected: false },
        ]}
        isSaving={false}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByLabelText("Starred"));
    fireEvent.click(screen.getByRole("button", { name: "保存选择" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith([
        { id: "INBOX", name: "Inbox", kind: "system" },
        { id: "STARRED", name: "Starred", kind: "system" },
      ]);
    });
  });
});
