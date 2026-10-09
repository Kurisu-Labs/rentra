import type { CSSProperties } from "react";

const paths = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  shield: "M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Zm-4 9 3 3 5-6",
  camera: "M8 6 10 3h4l2 3h4v14H4V6h4Zm8 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  tent: "m3 20 9-16 9 16H3Zm5 0 4-8 4 8M10 2l4 4m0-4-4 4",
  dress: "M8 3h8l-1 6 6 12H3L9 9 8 3Zm1 6h6M10 3v3h4V3",
  check: "m5 12 4 4L19 6",
  box: "m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 9v10M3 8l9 4 9-4M7.5 5.5l9 5v4",
} as const;

export function Icon({
  name,
  size = 20,
  style,
}: {
  name: keyof typeof paths;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
