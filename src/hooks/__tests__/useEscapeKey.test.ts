import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEscapeKey } from "../useEscapeKey";

describe("useEscapeKey", () => {
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call onClose when Escape key is pressed", () => {
    renderHook(() => useEscapeKey(onClose));

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    window.dispatchEvent(event);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should not call onClose for other keys", () => {
    renderHook(() => useEscapeKey(onClose));

    const event = new KeyboardEvent("keydown", { key: "Enter" });
    window.dispatchEvent(event);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("should not call onClose when disabled is true", () => {
    renderHook(() => useEscapeKey(onClose, true));

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    window.dispatchEvent(event);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("should call onClose when disabled changes from true to false", () => {
    const { rerender } = renderHook(
      ({ disabled }) => useEscapeKey(onClose, disabled),
      {
        initialProps: { disabled: true },
      }
    );

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    window.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();

    rerender({ disabled: false });
    window.dispatchEvent(event);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should cleanup event listener on unmount", () => {
    const { unmount } = renderHook(() => useEscapeKey(onClose));

    unmount();

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    window.dispatchEvent(event);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("should update event listener when onClose changes", () => {
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();

    const { rerender } = renderHook(
      ({ onClose }) => useEscapeKey(onClose),
      {
        initialProps: { onClose: onClose1 },
      }
    );

    const event = new KeyboardEvent("keydown", { key: "Escape" });
    window.dispatchEvent(event);
    expect(onClose1).toHaveBeenCalledTimes(1);
    expect(onClose2).not.toHaveBeenCalled();

    rerender({ onClose: onClose2 });
    window.dispatchEvent(event);
    expect(onClose1).toHaveBeenCalledTimes(1);
    expect(onClose2).toHaveBeenCalledTimes(1);
  });
});

