import type { KeyboardEvent, PointerEvent, RefObject } from "react";

type Props = {
  container: RefObject<HTMLElement>;
  orientation: "horizontal" | "vertical";
  value: number;
  min?: number;
  max?: number;
  initial: number;
  label: string;
  onChange: (value: number) => void;
};

export function Splitter({ container, orientation, value, min = 20, max = 80, initial, label, onChange }: Props) {
  const clamp = (next: number) => onChange(Math.min(max, Math.max(min, next)));

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = container.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault();
    document.body.classList.add("resizing");

    const move = (pointer: globalThis.PointerEvent) =>
      clamp(
        orientation === "vertical"
          ? ((pointer.clientX - bounds.left) / bounds.width) * 100
          : ((pointer.clientY - bounds.top) / bounds.height) * 100,
      );
    const stop = () => {
      document.body.classList.remove("resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const change = orientation === "vertical"
      ? { ArrowLeft: -5, ArrowRight: 5 }[event.key]
      : { ArrowUp: -5, ArrowDown: 5 }[event.key];
    if (change === undefined) return;
    event.preventDefault();
    clamp(value + change);
  };

  return (
    <div
      className={`splitter ${orientation}`}
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title={`${label}（拖动调整，双击复位）`}
      onPointerDown={startResize}
      onKeyDown={resizeWithKeyboard}
      onDoubleClick={() => onChange(initial)}
    />
  );
}
