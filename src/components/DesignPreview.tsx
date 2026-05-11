"use client";

import { useId } from "react";
import type { Design } from "@/lib/types";
import { garmentPath, GarmentDetails } from "./Garment";
import { ShapeNode } from "./Shapes";
import { elementTransform } from "@/lib/element-transform";

interface Props {
  design: Design;
  className?: string;
}

/** A non-interactive SVG render of a design — used for wardrobe/profile thumbnails. */
export default function DesignPreview({ design, className }: Props) {
  const clipId = `clip-${useId().replace(/:/g, "")}`;
  const path = garmentPath(design.garment);

  return (
    <svg
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid meet"
      className={className}
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
        {design.elements.map((el) => {
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
      <GarmentDetails type={design.garment} />
    </svg>
  );
}
