import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PrizePool from "../../components/PrizePool";

describe("PrizePool", () => {
  it("renders formatted amount with $CLAWN label", () => {
    render(<PrizePool amount={2500000} />);
    expect(screen.getByText("2,500,000")).toBeInTheDocument();
    expect(screen.getByText("$CLAWN")).toBeInTheDocument();
  });

  it("renders 'Prize Pool' heading", () => {
    render(<PrizePool amount={1000} />);
    expect(screen.getByText("Prize Pool")).toBeInTheDocument();
  });

  it("formats small amounts", () => {
    render(<PrizePool amount={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
