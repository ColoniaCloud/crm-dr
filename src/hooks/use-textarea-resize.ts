import { type RefObject, useLayoutEffect } from "react";

export function useTextareaResize(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight = 160
): void {
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [textareaRef, value, maxHeight]);
}
