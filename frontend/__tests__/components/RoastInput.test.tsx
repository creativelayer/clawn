import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RoastInput from "../../components/RoastInput";

describe("RoastInput", () => {
  it("renders textarea and submit button", () => {
    render(<RoastInput onSubmit={() => {}} />);
    expect(screen.getByPlaceholderText(/drop your roast/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit roast/i })).toBeInTheDocument();
  });

  it("shows character counter starting at 280", () => {
    render(<RoastInput onSubmit={() => {}} />);
    expect(screen.getByText("280")).toBeInTheDocument();
  });

  it("updates character counter as user types", () => {
    render(<RoastInput onSubmit={() => {}} />);
    const textarea = screen.getByPlaceholderText(/drop your roast/i);
    fireEvent.change(textarea, { target: { value: "Hello" } });
    expect(screen.getByText("275")).toBeInTheDocument();
  });

  it("disables submit when text is empty", () => {
    render(<RoastInput onSubmit={() => {}} />);
    expect(screen.getByRole("button", { name: /submit roast/i })).toBeDisabled();
  });

  it("disables submit when disabled prop is true", () => {
    render(<RoastInput onSubmit={() => {}} disabled />);
    const textarea = screen.getByPlaceholderText(/drop your roast/i);
    fireEvent.change(textarea, { target: { value: "test" } });
    expect(screen.getByRole("button", { name: /submit roast/i })).toBeDisabled();
  });

  it("calls onSubmit with trimmed text and clears input", () => {
    const onSubmit = vi.fn();
    render(<RoastInput onSubmit={onSubmit} />);
    const textarea = screen.getByPlaceholderText(/drop your roast/i);
    fireEvent.change(textarea, { target: { value: "  Great roast!  " } });
    fireEvent.click(screen.getByRole("button", { name: /submit roast/i }));
    expect(onSubmit).toHaveBeenCalledWith("Great roast!");
    expect(textarea).toHaveValue("");
  });

  it("shows negative count and disables submit when over 280 chars", () => {
    const onSubmit = vi.fn();
    render(<RoastInput onSubmit={onSubmit} />);
    const textarea = screen.getByPlaceholderText(/drop your roast/i);
    fireEvent.change(textarea, { target: { value: "a".repeat(285) } });
    expect(screen.getByText("-5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit roast/i })).toBeDisabled();
  });
});
