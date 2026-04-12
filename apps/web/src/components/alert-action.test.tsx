import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

function AlertAction({ onResolve }: { onResolve: () => Promise<void> }) {
  return <button onClick={() => void onResolve()}>Resolve</button>;
}

describe("Alert resolve action", () => {
  it("invokes the resolve handler", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    render(<AlertAction onResolve={onResolve} />);

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalled();
    });
  });
});
