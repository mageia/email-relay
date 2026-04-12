import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ImapSettingsForm from "./imap-settings-form";

describe("ImapSettingsForm", () => {
  it("submits updated server settings and selected folders", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ImapSettingsForm
        settings={{
          username: "admin@example.com",
          host: "imap.example.com",
          port: 993,
          secure: true,
          discoverySource: "srv",
        }}
        folders={[
          { id: "INBOX", name: "INBOX", kind: "system", selected: true },
          { id: "Archive", name: "Archive", kind: "custom", selected: false },
        ]}
        isSaving={false}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "other@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Host"), {
      target: { value: "mail.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Port"), {
      target: { value: "143" },
    });
    fireEvent.click(screen.getByLabelText("Archive"));
    fireEvent.click(screen.getByRole("button", { name: "保存 IMAP 设置" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        username: "other@example.com",
        host: "mail.example.com",
        port: 143,
        secure: true,
        folders: [
          { id: "INBOX", name: "INBOX", kind: "system" },
          { id: "Archive", name: "Archive", kind: "custom" },
        ],
      });
    });
  });
});
