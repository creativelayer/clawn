import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the farcaster module before importing the component
vi.mock("../../lib/farcaster", () => ({
  swapToken: vi.fn(),
}));

import BuyClawnButton from "../../components/BuyClawnButton";
import { swapToken } from "../../lib/farcaster";

describe("BuyClawnButton", () => {
  it("renders with correct text", () => {
    render(<BuyClawnButton />);
    expect(screen.getByRole("button", { name: /buy \$clawn/i })).toBeInTheDocument();
  });

  it("calls swapToken on click", () => {
    render(<BuyClawnButton />);
    fireEvent.click(screen.getByRole("button", { name: /buy \$clawn/i }));
    expect(swapToken).toHaveBeenCalled();
  });
});
