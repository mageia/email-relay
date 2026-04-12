import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import InboxSearchBar from "./inbox-search-bar";

describe("InboxSearchBar", () => {
  it("calls onChange when the search input changes", () => {
    const onChange = vi.fn();
    render(<InboxSearchBar value="" onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText("搜索主题、摘要或正文"), {
      target: { value: "invoice" },
    });

    expect(onChange).toHaveBeenCalledWith("invoice");
  });
});
