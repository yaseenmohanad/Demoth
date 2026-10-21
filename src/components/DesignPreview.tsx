"use client";

import { useId } from "react";
import type { Design, GarmentSide } from "@/lib/types";
import { garmentPath, GarmentDetails } from "./Garment";
import { ShapeNode } from "./Shapes";
import { elementTransform } from "@/lib/element-transform";

interface Props {
  design: Design;
  className?: string;
  /** Which face of the garment to render. Ignored when `animate` is on
   *  (the component then cycles both). Defaults to "front". */
  side?: GarmentSide;
  /** When true, the preview crossfades between front and back on an
   *  endless loop. Used on Browse so listings show both sides without
   *  the user flipping anything. */
  animate?: boolean;
}

/** A non-interactive SVG render of a design — used for wardrobe/profile
 *  thumbnails and marketplace cards. */
export default function DesignPreview({
  design,
  className,
  side = "front",
  animate,
}: Props) {
  if (animate) {
    // Stack the two sides and let CSS keyframes crossfade them. The
    // outer wrapper carries the size; each child is absolutely
    // positioned to fill it so the animation has nothing to layout
    // around.
    return (
      <div className={`relative ${className ?? ""}`}>
        <SideSvg
          design={design}
          side="front"
          extraClass="absolute inset-0 h-full w-full demoth-side-front"
        />
        <SideSvg
          design={design}
          side="back"
          extraClass="absolute inset-0 h-full w-full demoth-side-back"
        />
      </div>
    );
  }
  return <SideSvg design={design} side={side} extraClass={className ?? ""} />;
}

function SideSvg({
  design,
  side,
  extraClass,
}: {
  design: Design;
  side: GarmentSide;
  extraClass: string;
}) {
  const clipId = `clip-${useId().replace(/:/g, "")}`;
  const path = garmentPath(design.garment, side);
  const elements =
    side === "front" ? design.elements : design.elementsBack ?? [];

  return (
    <svg
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid meet"
      className={extraClass}
      role="img"
      aria-label={design.name}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={path} />
        </clipPath>
      </defs>
      <path
        d={path}
        fill={design.garmentColor}
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <g clipPath={`url(#${clipId})`}>
        {elements.map((el) => {
          const t = elementTransform(el);
          if (el.type === "text") {
            return (
              <g key={el.id} transform={t || undefined}>
                <text
                  x={el.x}
                  y={el.y}
                  fontSize={el.size}
                  fill={el.color}
                  fontFamily={el.font}
                  fontWeight={el.weight}
                  fontStyle={el.italic ? "italic" : "normal"}
                  dominantBaseline="middle"
                  textAnchor="middle"
                >
                  {el.text}
                </text>
              </g>
            );
          }
          if (el.type === "image") {
            return (
              <g key={el.id} transform={t || undefined}>
                <image
                  href={el.src}
                  x={el.x - el.w / 2}
                  y={el.y - el.h / 2}
                  width={el.w}
                  height={el.h}
                  preserveAspectRatio="xMidYMid slice"
                />
              </g>
            );
          }
          if (el.type === "shape") {
            return (
              <g key={el.id} transform={t || undefined}>
                <ShapeNode
                  variant={el.variant}
                  cx={el.x}
                  cy={el.y}
                  w={el.w}
                  h={el.h}
                  color={el.color}
                  uid={`${clipId}-${el.id}`}
                />
              </g>
            );
          }
          return (
            <g key={el.id} transform={t || undefined}>
              <path
                d={el.d}
                fill="none"
                stroke={el.color}
                strokeWidth={el.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </g>
      <GarmentDetails type={design.garment} side={side} />
    </svg>
  );
}
