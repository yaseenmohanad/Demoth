import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export function HomeIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function BrushIcon({ size = 24, ...p }: IconProps) {
  // Clean pencil silhouette: diagonal body, eraser/ferrule band near the
  // top, sharp tip at the bottom-left. Reads correctly at small sizes
  // (down to ~18px).
  return (
    <svg {...base(size, p)}>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function TruckIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <rect x="2" y="6" width="12" height="10" rx="1.5" />
      <path d="M14 9h4l3 3v4h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

export function UserIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

export function PlusIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function UploadIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 17v3h16v-3" />
    </svg>
  );
}

export function SearchIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function PencilIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 21h4l11-11-4-4L3 17v4Z" />
      <path d="m14 6 4 4" />
    </svg>
  );
}

export function TextIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M5 5h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function SaveIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v6h8V4" />
      <path d="M8 14h8v6H8z" />
    </svg>
  );
}

export function TrashIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7v13h12V7" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function CheckIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="m4 12 5 5L20 6" />
    </svg>
  );
}

export function XIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

export function ZoomInIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
      <path d="M11 8v6M8 11h6" />
    </svg>
  );
}

export function ZoomOutIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
      <path d="M8 11h6" />
    </svg>
  );
}

export function SpinnerIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)} className={`animate-spin ${p.className ?? ""}`}>
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  );
}

export function ScissorsIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M9 6 20 18" />
      <path d="M9 18 20 6" />
    </svg>
  );
}

export function ShapesIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <circle cx="7" cy="16" r="4" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
      <path d="M12 3 17 11 7 11Z" />
    </svg>
  );
}

export function CursorIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M5 4 13 20 15.5 13 22 11Z" />
    </svg>
  );
}

export function UndoIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M9 14 4 9 9 4" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}

export function RedoIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M15 14 20 9 15 4" />
      <path d="M20 9H9a5 5 0 0 0 0 10h3" />
    </svg>
  );
}

export function EyeIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function StorefrontIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M3 9 5 4h14l2 5" />
      <path d="M3 9v11h18V9" />
      <path d="M3 9c0 2 2 3 4 3s4-1 4-3" />
      <path d="M11 9c0 2 2 3 4 3s4-1 4-3" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export function SparkleIcon({ size = 24, ...p }: IconProps) {
  return (
    <svg {...base(size, p)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  );
}
