import { useEffect } from "react";

/**
 * Hook to handle ESC key press to close a modal/dialog
 * @param onClose - Function to call when ESC key is pressed
 * @param disabled - Optional condition to disable the ESC key handler (e.g., when loading or processing)
 */
export function useEscapeKey(
  onClose: () => void,
  disabled: boolean = false
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disabled) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, disabled]);
}

