"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  saveDesign,
  deleteDesign,
  getDesign,
  makeId,
  useHydrated,
} from "@/lib/store";
import type {
  Design,
  DesignElement,
  GarmentType,
  ShapeVariant,
} from "@/lib/types";
import { garmentPath, GarmentDetails } from "@/components/Garment";
import {
  ShapeNode,
  SHAPES_2D,
  SHAPES_3D,
  SHAPE_LABELS,
} from "@/components/Shapes";
import DesignPreview from "@/components/DesignPreview";
import {
  UploadIcon,
  SearchIcon,
  PencilIcon,
  TextIcon,
  SaveIcon,
  TrashIcon,
  PlusIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
  SpinnerIcon,
  ScissorsIcon,
  ShapesIcon,
  CursorIcon,
  UndoIcon,
  RedoIcon,
  EyeIcon,
} from "@/components/Icons";
import ConfirmDialog from "@/components/ConfirmDialog";
import ColorWheelButton from "@/components/ColorWheelButton";
import { displayName } from "@/lib/format";
import { elementTransform } from "@/lib/element-transform";

const VB_W = 400;
const VB_H = 500;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const MAX_IMAGE_DIM = 800;

interface BingResult {
  thumb: string;
  full: string;
  title: string;
}

/**
 * Run the AI background-removal model on an image and return a transparent
 * PNG as a data URL. The library is loaded lazily so the bundle isn't
 * bloated for users who never use this feature; the underlying ONNX model
 * (~30 MB) is fetched on first use and cached in the browser.
 */
async function removeImageBackground(srcDataUrl: string): Promise<string> {
  const { removeBackground } = await import("@imgly/background-removal");
  const blob = await removeBackground(srcDataUrl);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read result"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetch a remote image through our proxy and return a downscaled data URL.
 * The data URL is portable (works offline, persists in localStorage) and
 * sized to {@link MAX_IMAGE_DIM} on its longest side to keep storage small.
 */
async function imageUrlToDataUrl(
  url: string,
  maxDim = MAX_IMAGE_DIM
): Promise<string> {
  const proxied = `/api/image-proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxied);
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) detail = j.error;
    } catch {
      // ignore — keep status-only detail
    }
    throw new Error(`Image fetch failed: ${detail}`);
  }
  const blob = await res.blob();

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      try {
        const ratio = Math.min(
          maxDim / img.naturalWidth,
          maxDim / img.naturalHeight,
          1
        );
        const w = Math.max(1, Math.round(img.naturalWidth * ratio));
        const h = Math.max(1, Math.round(img.naturalHeight * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No canvas context");
        ctx.drawImage(img, 0, 0, w, h);
        const fmt = blob.type === "image/png" ? "image/png" : "image/jpeg";
        const dataUrl =
          fmt === "image/png"
            ? canvas.toDataURL(fmt)
            : canvas.toDataURL(fmt, 0.85);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch (e) {
        URL.revokeObjectURL(objectUrl);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image decode failed"));
    };
    img.src = objectUrl;
  });
}

const GARMENT_COLORS = [
  "#ffffff",
  "#0f172a",
  "#7c3aed",
  "#0d9488",
  "#dc2626",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
];

const TEXT_COLORS = [
  "#000000",
  "#ffffff",
  "#7c3aed",
  "#dc2626",
  "#f59e0b",
  "#0d9488",
  "#3b82f6",
  "#ec4899",
];

const FONTS = [
  { label: "Sans", value: "var(--font-geist-sans), system-ui, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "var(--font-geist-mono), monospace" },
  { label: "Display", value: "Impact, 'Arial Black', sans-serif" },
];

type Tool = "select" | "draw";

function newDraft(): Design {
  return {
    id: makeId(),
    name: "Untitled design",
    garment: "tshirt",
    garmentColor: "#ffffff",
    elements: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export default function DesignStudio() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useHydrated();
  const idParam = params.get("id");
  const clipId = `studio-clip-${useId().replace(/:/g, "")}`;

  const [design, setDesign] = useState<Design>(() => newDraft());
  const [garmentChosen, setGarmentChosen] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawColor, setDrawColor] = useState("#7c3aed");
  const [drawWidth, setDrawWidth] = useState(4);
  const [showWeb, setShowWeb] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origPanX: number;
    origPanY: number;
    moved: boolean;
  } | null>(null);

  // Unsaved-changes tracking. We store a JSON snapshot of the design at the
  // last save (or load) and compare to the current design to know if the
  // user has made unsaved changes.
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bgRemovingId, setBgRemovingId] = useState<string | null>(null);
  const [showShapes, setShowShapes] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  /**
   * Context menu state. `elementId` is the right-clicked element when one
   * was hit, or null when the user right-clicked an empty area of the
   * canvas — in which case Paste places the clipboard at (svgX, svgY).
   */
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    elementId: string | null;
    svgX: number;
    svgY: number;
  } | null>(null);

  /** Last copied element (JSON snapshot). Lives for the session — refreshing
   * the page clears it. */
  const [clipboard, setClipboard] = useState<DesignElement | null>(null);

  // Undo/redo history. We snapshot the design as a JSON string before each
  // discrete user action; redo stores forward states until a new edit is made.
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  // Live transform tracking — used for the resize/rotate handles to also
  // show angle / pre-resize state without recording every pointermove.
  const transformRef = useRef<
    | {
        kind: "resize" | "rotate";
        elementId: string;
        pointerId: number;
        // resize-specific
        anchor?: "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";
        startX: number;
        startY: number;
        origCx: number;
        origCy: number;
        origW: number;
        origH: number;
      }
    | null
  >(null);
  const [liveAngle, setLiveAngle] = useState<number | null>(null);

  const isDirty = garmentChosen && savedSnapshot !== "" && savedSnapshot !== JSON.stringify(design);

  // Compute viewBox from zoom, keeping the garment centered. Pan offset
  // shifts the view so the user can drag the canvas around at any zoom.
  const vbW = VB_W / zoom;
  const vbH = VB_H / zoom;
  const vbX = (VB_W - vbW) / 2 + pan.x;
  const vbY = (VB_H - vbH) / 2 + pan.y;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{
    elementId: string;
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const drawRef = useRef<{
    pointerId: number;
    points: { x: number; y: number }[];
    pathId: string;
  } | null>(null);

  /** Push the current design onto the history stack (for undo). */
  function pushHistory() {
    setHistory((h) => [...h, JSON.stringify(design)].slice(-100));
    setFuture([]);
  }
  function undo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture((f) => [JSON.stringify(design), ...f].slice(0, 100));
    setHistory((h) => h.slice(0, -1));
    try {
      setDesign(JSON.parse(prev));
    } catch {
      /* ignore */
    }
    setSelectedId(null);
  }
  function redo() {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((h) => [...h, JSON.stringify(design)].slice(-100));
    setFuture((f) => f.slice(1));
    try {
      setDesign(JSON.parse(next));
    } catch {
      /* ignore */
    }
    setSelectedId(null);
  }

  // Keyboard shortcut: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z (or +Y) = redo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, history, future]);

  // Load existing design if ?id= is present
  useEffect(() => {
    if (!hydrated) return;
    if (idParam) {
      const existing = getDesign(idParam);
      if (existing) {
        setDesign(existing);
        setGarmentChosen(true);
        setSavedSnapshot(JSON.stringify(existing));
      }
    }
  }, [hydrated, idParam]);

  // For brand-new designs: take the initial snapshot the moment the user
  // picks a garment so anything they do afterward is considered dirty.
  useEffect(() => {
    if (garmentChosen && savedSnapshot === "") {
      setSavedSnapshot(JSON.stringify(design));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garmentChosen]);

  // Intercept clicks on internal nav links while there are unsaved changes.
  // Anchor clicks on the bottom nav (or anywhere outside the studio) bubble
  // up to document, so a capture-phase listener catches them before
  // Next.js's <Link> handles routing.
  useEffect(() => {
    if (!isDirty) return;
    function handleClick(e: MouseEvent) {
      // ignore modified clicks (open in new tab, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      // Allow links that stay within the studio (e.g. ?id=)
      const path = href.split("?")[0];
      if (path === "/design") return;
      e.preventDefault();
      e.stopPropagation();
      setPendingNav(href);
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty]);

  // Browser-level safety net for full reload / window close.
  useEffect(() => {
    if (!isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const selected = useMemo(
    () => design.elements.find((e) => e.id === selectedId) ?? null,
    [design.elements, selectedId]
  );

  // ---- coordinate helpers ----
  function clientToSvg(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const t = pt.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  }

  // ---- element mutations ----
  /** Patch an element. Pass `commit:true` to push history first (use for
   * single-shot changes; live drag/resize loops should NOT commit per move). */
  function patchElement(
    id: string,
    patch: Partial<DesignElement>,
    options?: { commit?: boolean }
  ) {
    if (options?.commit) pushHistory();
    setDesign((d) => ({
      ...d,
      elements: d.elements.map((e) =>
        e.id === id ? ({ ...e, ...patch } as DesignElement) : e
      ),
    }));
  }

  function addElement(el: DesignElement) {
    pushHistory();
    setDesign((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(el.id);
  }

  function removeElement(id: string) {
    pushHistory();
    setDesign((d) => ({
      ...d,
      elements: d.elements.filter((e) => e.id !== id),
    }));
    if (selectedId === id) setSelectedId(null);
  }

  function setGarmentColor(c: string) {
    pushHistory();
    setDesign((d) => ({ ...d, garmentColor: c }));
  }

  // ---- flip + z-order ---------------------------------------------------
  function flipElement(id: string, axis: "x" | "y") {
    pushHistory();
    setDesign((d) => ({
      ...d,
      elements: d.elements.map((el) => {
        if (el.id !== id) return el;
        const key = axis === "x" ? "flipX" : "flipY";
        return { ...el, [key]: !el[key] } as DesignElement;
      }),
    }));
  }

  /** Move element one step toward the front (later in array = drawn on top). */
  function bringForward(id: string) {
    setDesign((d) => {
      const idx = d.elements.findIndex((e) => e.id === id);
      if (idx < 0 || idx === d.elements.length - 1) return d;
      pushHistory();
      const next = [...d.elements];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return { ...d, elements: next };
    });
  }
  function bringToFront(id: string) {
    setDesign((d) => {
      const idx = d.elements.findIndex((e) => e.id === id);
      if (idx < 0 || idx === d.elements.length - 1) return d;
      pushHistory();
      const next = [...d.elements];
      const [el] = next.splice(idx, 1);
      next.push(el);
      return { ...d, elements: next };
    });
  }
  function sendBackward(id: string) {
    setDesign((d) => {
      const idx = d.elements.findIndex((e) => e.id === id);
      if (idx <= 0) return d;
      pushHistory();
      const next = [...d.elements];
      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      return { ...d, elements: next };
    });
  }
  function sendToBack(id: string) {
    setDesign((d) => {
      const idx = d.elements.findIndex((e) => e.id === id);
      if (idx <= 0) return d;
      pushHistory();
      const next = [...d.elements];
      const [el] = next.splice(idx, 1);
      next.unshift(el);
      return { ...d, elements: next };
    });
  }

  // ---- tool handlers ----
  function addText() {
    addElement({
      id: makeId(),
      type: "text",
      text: "Your text",
      x: VB_W / 2,
      y: VB_H / 2,
      size: 32,
      color: "#000000",
      font: FONTS[0].value,
      weight: "bold",
      italic: false,
      rot: 0,
    });
    setTool("select");
  }

  function addShape(variant: ShapeVariant) {
    addElement({
      id: makeId(),
      type: "shape",
      variant,
      x: VB_W / 2,
      y: VB_H / 2,
      w: 110,
      h: 110,
      rot: 0,
      color: "#7c3aed",
    });
    setTool("select");
  }

  function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void addImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // reset so same file can be re-picked
  }

  /**
   * Add an image to the design, scaled to a sensible default size on the
   * shirt. We read the image's natural dimensions and fit the longer side
   * to {@link DEFAULT_IMAGE_SIDE} px in viewBox units, preserving aspect
   * ratio. This stops every new image from filling the whole canvas.
   */
  async function addImage(src: string) {
    const DEFAULT_IMAGE_SIDE = 110; // viewBox units (canvas is 400x500)
    let w = DEFAULT_IMAGE_SIDE;
    let h = DEFAULT_IMAGE_SIDE;
    try {
      const dims = await new Promise<{ w: number; h: number }>(
        (resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => reject(new Error("decode failed"));
          img.src = src;
        }
      );
      if (dims.w > 0 && dims.h > 0) {
        const ratio =
          dims.w >= dims.h
            ? DEFAULT_IMAGE_SIDE / dims.w
            : DEFAULT_IMAGE_SIDE / dims.h;
        w = Math.max(20, Math.round(dims.w * ratio));
        h = Math.max(20, Math.round(dims.h * ratio));
      }
    } catch {
      // fall back to default square
    }
    addElement({
      id: makeId(),
      type: "image",
      src,
      x: VB_W / 2,
      y: VB_H / 2,
      w,
      h,
      rot: 0,
    });
    setTool("select");
  }

  // ---- canvas pointer logic ----
  function onCanvasPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (tool === "draw") {
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      const id = makeId();
      drawRef.current = {
        pointerId: e.pointerId,
        points: [{ x, y }],
        pathId: id,
      };
      (e.target as Element).setPointerCapture(e.pointerId);
      // addElement already pushes history once for the whole stroke. The
      // initial bbox is a degenerate point at (x, y); pointermove will
      // grow it as more points arrive.
      addElement({
        id,
        type: "stroke",
        d: `M ${x} ${y}`,
        color: drawColor,
        width: drawWidth,
        x,
        y,
        w: 0,
        h: 0,
        rot: 0,
      });
      e.preventDefault();
    } else {
      // Empty canvas → start a pan; if no movement, deselect on pointerup.
      if (e.target === svgRef.current) {
        panRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          origPanX: pan.x,
          origPanY: pan.y,
          moved: false,
        };
        (e.target as Element).setPointerCapture(e.pointerId);
      }
    }
  }

  function onCanvasPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    // panning the canvas (drag on empty space)
    if (panRef.current && panRef.current.pointerId === e.pointerId) {
      const dxScreen = e.clientX - panRef.current.startClientX;
      const dyScreen = e.clientY - panRef.current.startClientY;
      // Convert screen pixels → viewBox units using the SVG's CTM
      const ctm = svgRef.current?.getScreenCTM();
      const scaleX = ctm?.a || 1;
      const scaleY = ctm?.d || 1;
      const dxVB = dxScreen / scaleX;
      const dyVB = dyScreen / scaleY;
      // Mark as actually panned once the user has moved more than a couple
      // pixels — otherwise treat the gesture as a click that should deselect.
      if (Math.abs(dxScreen) + Math.abs(dyScreen) > 3) {
        panRef.current.moved = true;
      }
      setPan({
        x: panRef.current.origPanX - dxVB,
        y: panRef.current.origPanY - dyVB,
      });
      return;
    }
    // drawing
    if (tool === "draw" && drawRef.current && drawRef.current.pointerId === e.pointerId) {
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      drawRef.current.points.push({ x, y });
      const d =
        "M " +
        drawRef.current.points
          .map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" L ");
      // Recompute bbox from accumulated points so the stroke's logical
      // x/y/w/h stay in sync with what's been drawn.
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const p of drawRef.current.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      patchElement(drawRef.current.pathId, {
        d,
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        w: maxX - minX,
        h: maxY - minY,
      } as Partial<DesignElement>);
      return;
    }
    // resize / rotate via handle
    if (
      transformRef.current &&
      transformRef.current.pointerId === e.pointerId
    ) {
      const t = transformRef.current;
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      if (t.kind === "rotate") {
        // angle from element center to pointer; -90 makes "up" = 0deg
        const dx = x - t.origCx;
        const dy = y - t.origCy;
        let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        if (deg < -180) deg += 360;
        if (deg > 180) deg -= 360;
        // Snap to 15° while shift-held? Keep free for now.
        const rounded = Math.round(deg);
        patchElement(t.elementId, { rot: rounded } as Partial<DesignElement>);
        setLiveAngle(rounded);
      } else if (t.kind === "resize") {
        // Center-pivot resize. Side handles change one dimension; corners
        // change both. There is no upper bound on size; minimum 12px so
        // the element doesn't disappear.
        const halfX = Math.max(12, Math.abs(x - t.origCx));
        const halfY = Math.max(12, Math.abs(y - t.origCy));
        let newW = t.origW;
        let newH = t.origH;
        switch (t.anchor) {
          case "l":
          case "r":
            newW = halfX * 2;
            break;
          case "t":
          case "b":
            newH = halfY * 2;
            break;
          case "tl":
          case "tr":
          case "bl":
          case "br":
            newW = halfX * 2;
            newH = halfY * 2;
            break;
        }
        const target = design.elements.find((el) => el.id === t.elementId);
        if (!target) return;
        if (target.type === "text") {
          // For text, scale font size based on the average ratio
          const ratio = (newW / t.origW + newH / t.origH) / 2;
          patchElement(target.id, {
            size: Math.max(8, Math.round(target.size * ratio)),
          } as Partial<DesignElement>);
          // After re-rendering with new size we lose the ref baseline but
          // the bbox math still works because `t.origW/origH` are frozen.
        } else if (
          target.type === "image" ||
          target.type === "shape" ||
          target.type === "stroke"
        ) {
          patchElement(target.id, {
            w: Math.round(newW),
            h: Math.round(newH),
          } as Partial<DesignElement>);
        }
      }
      return;
    }
    // dragging an element
    if (dragRef.current && dragRef.current.pointerId === e.pointerId) {
      const { x, y } = clientToSvg(e.clientX, e.clientY);
      const dx = x - dragRef.current.startX;
      const dy = y - dragRef.current.startY;
      patchElement(dragRef.current.elementId, {
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY + dy,
      } as Partial<DesignElement>);
    }
  }

  function onCanvasPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    if (drawRef.current && drawRef.current.pointerId === e.pointerId) {
      drawRef.current = null;
    }
    if (dragRef.current && dragRef.current.pointerId === e.pointerId) {
      dragRef.current = null;
    }
    if (
      transformRef.current &&
      transformRef.current.pointerId === e.pointerId
    ) {
      transformRef.current = null;
      setLiveAngle(null);
    }
    if (panRef.current && panRef.current.pointerId === e.pointerId) {
      // If the user didn't actually pan, treat the gesture as a click on
      // empty canvas → deselect.
      if (!panRef.current.moved) {
        setSelectedId(null);
      }
      panRef.current = null;
    }
  }

  function onElementContextMenu(
    e: ReactMouseEvent<SVGElement>,
    el: DesignElement
  ) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    const { x: sx, y: sy } = clientToSvg(e.clientX, e.clientY);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      elementId: el.id,
      svgX: sx,
      svgY: sy,
    });
  }

  function onCanvasContextMenu(e: ReactMouseEvent<SVGSVGElement>) {
    // This fires for right-clicks anywhere on the canvas that *didn't* hit
    // an element (those call onElementContextMenu and stop propagation
    // first). So the target here is either the svg itself, the garment
    // path, or a wrapper <g> — all of which we treat as "empty canvas".
    e.preventDefault();
    const { x: sx, y: sy } = clientToSvg(e.clientX, e.clientY);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      elementId: null,
      svgX: sx,
      svgY: sy,
    });
  }

  // ---- clipboard ----
  /** Copy the given element to the in-memory clipboard. */
  function copyElement(id: string) {
    const el = design.elements.find((e) => e.id === id);
    if (!el) return;
    setClipboard(JSON.parse(JSON.stringify(el)) as DesignElement);
  }

  /**
   * Paste the clipboard at (cx, cy). If `replaceId` is given the target
   * element is replaced by the pasted one (its z-position is preserved);
   * otherwise the pasted element is appended on top.
   */
  function pasteClipboard(cx: number, cy: number, replaceId?: string | null) {
    if (!clipboard) return;
    pushHistory();
    const fresh = {
      ...(JSON.parse(JSON.stringify(clipboard)) as DesignElement),
      id: makeId(),
      x: cx,
      y: cy,
    } as DesignElement;
    setDesign((d) => {
      if (replaceId) {
        return {
          ...d,
          elements: d.elements.map((e) => (e.id === replaceId ? fresh : e)),
        };
      }
      return { ...d, elements: [...d.elements, fresh] };
    });
    setSelectedId(fresh.id);
  }

  function onElementPointerDown(
    e: ReactPointerEvent<SVGElement>,
    el: DesignElement
  ) {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelectedId(el.id);
    const { x, y } = clientToSvg(e.clientX, e.clientY);
    pushHistory(); // single snapshot for the whole drag
    dragRef.current = {
      elementId: el.id,
      pointerId: e.pointerId,
      startX: x,
      startY: y,
      origX: el.x,
      origY: el.y,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  // ---- resize handles ----
  /** Bounding box (in viewBox coords) for an element. */
  function elementBBox(el: DesignElement): {
    cx: number;
    cy: number;
    w: number;
    h: number;
  } | null {
    if (el.type === "image" || el.type === "shape") {
      return { cx: el.x, cy: el.y, w: el.w, h: el.h };
    }
    if (el.type === "text") {
      // approximate; real bbox depends on font metrics
      const w = Math.max(el.size * 1.5, el.size * el.text.length * 0.55);
      const h = el.size * 1.4;
      return { cx: el.x, cy: el.y, w, h };
    }
    if (el.type === "stroke") {
      // Use a minimum displayed size so handles are clickable on a tiny dot.
      return {
        cx: el.x,
        cy: el.y,
        w: Math.max(el.w, 20),
        h: Math.max(el.h, 20),
      };
    }
    return null;
  }

  function onResizeHandlePointerDown(
    e: ReactPointerEvent<SVGElement>,
    el: DesignElement,
    anchor: "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l"
  ) {
    e.stopPropagation();
    const bbox = elementBBox(el);
    if (!bbox) return;
    const { x, y } = clientToSvg(e.clientX, e.clientY);
    pushHistory();
    transformRef.current = {
      kind: "resize",
      elementId: el.id,
      pointerId: e.pointerId,
      anchor,
      startX: x,
      startY: y,
      origCx: bbox.cx,
      origCy: bbox.cy,
      origW: bbox.w,
      origH: bbox.h,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onRotateHandlePointerDown(
    e: ReactPointerEvent<SVGElement>,
    el: DesignElement
  ) {
    e.stopPropagation();
    const bbox = elementBBox(el);
    if (!bbox) return;
    pushHistory();
    transformRef.current = {
      kind: "rotate",
      elementId: el.id,
      pointerId: e.pointerId,
      startX: bbox.cx, // for rotate, startX/Y are the pivot center
      startY: bbox.cy,
      origCx: bbox.cx,
      origCy: bbox.cy,
      origW: bbox.w,
      origH: bbox.h,
    };
    setLiveAngle(("rot" in el ? el.rot : 0) ?? 0);
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  // ---- save ----
  function handleSave() {
    saveDesign(design);
    setSavedSnapshot(JSON.stringify(design));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  // ---- garment picker (only for brand new designs) ----
  if (!garmentChosen && !idParam) {
    return (
      <GarmentPicker
        onPick={(g) => {
          setDesign((d) => ({ ...d, garment: g }));
          setGarmentChosen(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
            Creator Studio
          </p>
          <input
            value={design.name}
            onChange={(e) => {
              if (
                e.target.value !== design.name &&
                history[history.length - 1] !== JSON.stringify(design)
              ) {
                pushHistory();
              }
              setDesign((d) => ({ ...d, name: e.target.value }));
            }}
            maxLength={40}
            className="w-full bg-transparent text-2xl font-bold leading-tight focus:outline-none"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--background)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <UndoIcon size={18} />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.length === 0}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--background)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RedoIcon size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowClearAllConfirm(true)}
            disabled={design.elements.length === 0}
            aria-label="Clear all"
            title="Clear all elements"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted)] ring-1 ring-[var(--border)] transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <TrashIcon size={18} />
          </button>
          <button
            onClick={handleSave}
            className="ml-1 flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--primary-strong)]"
          >
            <SaveIcon size={18} />
            {savedFlash ? "Saved!" : "Save"}
          </button>
        </div>
      </header>

      {/* Garment color row */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Shirt color
        </span>
        {GARMENT_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setGarmentColor(c)}
            aria-label={`Set shirt color ${c}`}
            className={`h-7 w-7 shrink-0 rounded-full border-2 transition-transform hover:scale-110 ${
              design.garmentColor === c
                ? "border-[var(--primary)] ring-2 ring-[var(--primary-soft)]"
                : "border-[var(--border)]"
            }`}
            style={{ background: c }}
          />
        ))}
        <ColorWheelButton
          value={design.garmentColor}
          onChange={setGarmentColor}
          title="Custom shirt color"
        />
      </div>

      {/* Canvas */}
      <div
        className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[var(--border)]"
        style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
      >
        <svg
          ref={svgRef}
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          className="h-full w-full select-none"
          style={{
            touchAction: "none",
            cursor:
              tool === "draw"
                ? "crosshair"
                : panRef.current?.moved
                ? "grabbing"
                : "grab",
          }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          onContextMenu={onCanvasContextMenu}
        >
          <defs>
            <clipPath id={clipId}>
              <path d={garmentPath(design.garment)} />
            </clipPath>
          </defs>

          {/* Garment base (not clipped) */}
          <path
            d={garmentPath(design.garment)}
            fill={design.garmentColor}
            stroke="rgba(0,0,0,0.18)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Ghost layer — unclipped, dim. Lets the user see and grab
              elements that have wandered outside the garment shape. */}
          <g opacity={0.22}>
            {design.elements.map((el) =>
              renderElement(
                el,
                selectedId,
                onElementPointerDown,
                onElementContextMenu,
                `${clipId}-ghost`
              )
            )}
          </g>

          {/* Real layer — clipped to the garment shape */}
          <g clipPath={`url(#${clipId})`}>
            {design.elements.map((el) =>
              renderElement(
                el,
                selectedId,
                onElementPointerDown,
                onElementContextMenu,
                clipId
              )
            )}
          </g>

          {/* Garment details (collar, buttons) drawn on top */}
          <GarmentDetails type={design.garment} />

          {/* Selection ring + interactive handles (drawn outside the clip) */}
          {selected && (
            <SelectionOverlay
              element={selected}
              bbox={elementBBox(selected)}
              liveAngle={liveAngle}
              onResizeDown={onResizeHandlePointerDown}
              onRotateDown={onRotateHandlePointerDown}
            />
          )}
        </svg>

        {/* Zoom controls (overlay) */}
        <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow ring-1 ring-[var(--border)] transition-colors hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ZoomInIcon size={18} />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom out"
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow ring-1 ring-[var(--border)] transition-colors hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ZoomOutIcon size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
            aria-label="Reset view"
            title="Reset zoom & pan"
            className="pointer-events-auto rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[var(--muted)] shadow ring-1 ring-[var(--border)] transition-colors hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>

        {tool === "draw" && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-[var(--primary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow">
            Drawing — tap a tool to stop
          </div>
        )}
      </div>

      {/* Selected element controls */}
      {selected && (
        <ElementControls
          element={selected}
          onPatch={(id, patch) =>
            patchElement(id, patch, { commit: true })
          }
          onDelete={removeElement}
          bgRemovingId={bgRemovingId}
          onRemoveBackground={async (id, src) => {
            setBgRemovingId(id);
            try {
              const newSrc = await removeImageBackground(src);
              patchElement(id, { src: newSrc } as Partial<DesignElement>);
            } catch (err) {
              alert(
                err instanceof Error
                  ? `Couldn't remove background: ${err.message}`
                  : "Couldn't remove background. Try a different image."
              );
            } finally {
              setBgRemovingId(null);
            }
          }}
        />
      )}

      {/* Draw controls (only when in draw mode) */}
      {tool === "draw" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Brush
          </span>
          <div className="flex items-center gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setDrawColor(c)}
                aria-label={`Brush color ${c}`}
                className={`h-6 w-6 rounded-full border-2 ${
                  drawColor === c
                    ? "border-[var(--primary)] ring-2 ring-[var(--primary-soft)]"
                    : "border-[var(--border)]"
                }`}
                style={{ background: c }}
              />
            ))}
            <ColorWheelButton
              value={drawColor}
              onChange={setDrawColor}
              size={6}
              title="Custom brush color"
            />
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs">
            <span className="text-[var(--muted)]">Size</span>
            <input
              type="range"
              min={1}
              max={20}
              value={drawWidth}
              onChange={(e) => setDrawWidth(Number(e.target.value))}
            />
            <span className="w-6 text-right tabular-nums">{drawWidth}</span>
          </label>
        </div>
      )}

      {/* Toolbar */}
      <div className="grid grid-cols-4 gap-2 rounded-3xl bg-white p-3 ring-1 ring-[var(--border)]">
        <ToolButton
          label="Upload"
          Icon={UploadIcon}
          onClick={() => fileInputRef.current?.click()}
        />
        <ToolButton
          label="Search Web"
          Icon={SearchIcon}
          onClick={() => setShowWeb(true)}
        />
        <ToolButton label="Text" Icon={TextIcon} onClick={addText} />
        <ToolButton
          label="Shapes"
          Icon={ShapesIcon}
          onClick={() => setShowShapes(true)}
        />
        <ToolButton
          label="Select"
          Icon={CursorIcon}
          active={tool === "select"}
          onClick={() => setTool("select")}
        />
        <ToolButton
          label="Draw"
          Icon={PencilIcon}
          active={tool === "draw"}
          onClick={() => setTool(tool === "draw" ? "select" : "draw")}
        />
        <ToolButton
          label="Preview"
          Icon={EyeIcon}
          onClick={() => setShowPreview(true)}
        />
        <ToolButton label="Save" Icon={SaveIcon} onClick={handleSave} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onUpload}
          className="hidden"
        />
      </div>

      {/* Danger zone for existing designs */}
      {idParam && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="mx-auto flex items-center gap-1 text-xs text-[var(--muted)] hover:text-red-600"
        >
          <TrashIcon size={14} /> Delete this design
        </button>
      )}

      {/* Search web modal */}
      {showWeb && (
        <WebSearchModal
          onClose={() => setShowWeb(false)}
          onPick={(url) => {
            void addImage(url);
            setShowWeb(false);
          }}
        />
      )}

      {/* Shapes picker modal */}
      {showShapes && (
        <ShapesModal
          onClose={() => setShowShapes(false)}
          onPick={(variant) => {
            addShape(variant);
            setShowShapes(false);
          }}
        />
      )}

      {/* Preview modal */}
      {showPreview && (
        <PreviewModal
          design={design}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          element={
            contextMenu.elementId
              ? design.elements.find((e) => e.id === contextMenu.elementId) ?? null
              : null
          }
          design={design}
          hasClipboard={!!clipboard}
          clipboardLabel={clipboardLabel(clipboard)}
          onClose={() => setContextMenu(null)}
          onCopy={() => {
            if (contextMenu.elementId) copyElement(contextMenu.elementId);
          }}
          onPaste={() =>
            pasteClipboard(
              contextMenu.svgX,
              contextMenu.svgY,
              contextMenu.elementId
            )
          }
          onFlip={(axis) => {
            if (contextMenu.elementId) flipElement(contextMenu.elementId, axis);
          }}
          onBringToFront={() => {
            if (contextMenu.elementId) bringToFront(contextMenu.elementId);
          }}
          onBringForward={() => {
            if (contextMenu.elementId) bringForward(contextMenu.elementId);
          }}
          onSendBackward={() => {
            if (contextMenu.elementId) sendBackward(contextMenu.elementId);
          }}
          onSendToBack={() => {
            if (contextMenu.elementId) sendToBack(contextMenu.elementId);
          }}
        />
      )}

      {/* Unsaved-changes guard */}
      {pendingNav && (
        <UnsavedChangesModal
          onCancel={() => setPendingNav(null)}
          onLeave={() => {
            // Mark clean so the click handler doesn't intercept the
            // programmatic navigation we're about to do.
            setSavedSnapshot(JSON.stringify(design));
            const dest = pendingNav;
            setPendingNav(null);
            router.push(dest);
          }}
          onSaveAndLeave={() => {
            saveDesign(design);
            setSavedSnapshot(JSON.stringify(design));
            const dest = pendingNav;
            setPendingNav(null);
            router.push(dest);
          }}
        />
      )}

      {/* Delete-design confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete this design?"
        message={
          <>
            Are you sure you want to delete{" "}
            <strong>
              &quot;
              {idParam ? displayName(design, [design]) : design.name}
              &quot;
            </strong>
            ? This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          deleteDesign(design.id);
          // Clear dirty so the unsaved-changes guard doesn't fire
          setSavedSnapshot(JSON.stringify(design));
          setShowDeleteConfirm(false);
          router.push("/profile");
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Clear-all confirmation */}
      <ConfirmDialog
        open={showClearAllConfirm}
        title="Clear all elements?"
        message={
          <>
            This removes <strong>every</strong> image, text, drawing, and
            shape from this design. The shirt itself stays. You can press
            <strong> Undo</strong> right after to bring them back.
          </>
        }
        confirmLabel="Yes, clear all"
        cancelLabel="No, keep them"
        destructive
        onConfirm={() => {
          pushHistory();
          setDesign((d) => ({ ...d, elements: [] }));
          setSelectedId(null);
          setShowClearAllConfirm(false);
        }}
        onCancel={() => setShowClearAllConfirm(false)}
      />
    </div>
  );
}

/** Short label like "image" / "text" / "shape" / "drawing" for menu hints. */
function clipboardLabel(el: DesignElement | null): string {
  if (!el) return "";
  if (el.type === "stroke") return "drawing";
  return el.type;
}

function ContextMenu({
  x,
  y,
  element,
  design,
  hasClipboard,
  clipboardLabel: clipLabel,
  onClose,
  onCopy,
  onPaste,
  onFlip,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
}: {
  x: number;
  y: number;
  /** The element that was right-clicked, or null for a canvas-blank click. */
  element: DesignElement | null;
  design: Design;
  hasClipboard: boolean;
  clipboardLabel: string;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onFlip: (axis: "x" | "y") => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
}) {
  // Close on Esc / outside click
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest?.("[data-context-menu]")) onClose();
    }
    window.addEventListener("keydown", onKey);
    // capture phase so we beat any element handlers
    document.addEventListener("mousedown", onClickOutside, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside, true);
    };
  }, [onClose]);

  // Clamp to viewport so we don't render off-screen
  const clampedX = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 220);
  const clampedY = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 320);

  function run(fn: () => void) {
    fn();
    onClose();
  }

  // ---- Empty-canvas variant: just a Paste option ----
  if (!element) {
    return (
      <div
        data-context-menu
        role="menu"
        className="fixed z-[60] min-w-[200px] overflow-hidden rounded-xl bg-white py-1 text-sm shadow-xl ring-1 ring-[var(--border)]"
        style={{ left: clampedX, top: clampedY }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <MenuItem
          onClick={() => run(onPaste)}
          disabled={!hasClipboard}
          hint={hasClipboard ? `Place a ${clipLabel}` : "Nothing copied"}
        >
          📋 Paste
        </MenuItem>
      </div>
    );
  }

  // ---- Element variant: copy, paste-to-replace, flip, z-order ----
  const idx = design.elements.findIndex((e) => e.id === element.id);
  const total = design.elements.length;
  const isFrontmost = idx === total - 1;
  const isBackmost = idx === 0;

  return (
    <div
      data-context-menu
      role="menu"
      className="fixed z-[60] min-w-[220px] overflow-hidden rounded-xl bg-white py-1 text-sm shadow-xl ring-1 ring-[var(--border)]"
      style={{ left: clampedX, top: clampedY }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem onClick={() => run(onCopy)}>📄 Copy</MenuItem>
      <MenuItem
        onClick={() => run(onPaste)}
        disabled={!hasClipboard}
        hint={hasClipboard ? "Replace with copy" : "Nothing copied"}
      >
        📋 Paste
      </MenuItem>
      <div className="my-1 border-t border-[var(--border)]" />
      <MenuItem onClick={() => run(() => onFlip("y"))}>
        ↕ Flip vertically
      </MenuItem>
      <MenuItem onClick={() => run(() => onFlip("x"))}>
        ↔ Flip horizontally
      </MenuItem>
      <div className="my-1 border-t border-[var(--border)]" />
      <MenuItem
        onClick={() => run(onBringToFront)}
        disabled={isFrontmost}
        hint="Top of the stack"
      >
        ⬆⬆ Go to the front
      </MenuItem>
      <MenuItem
        onClick={() => run(onBringForward)}
        disabled={isFrontmost}
        hint="Up one layer"
      >
        ⬆ Go forward
      </MenuItem>
      <MenuItem
        onClick={() => run(onSendBackward)}
        disabled={isBackmost}
        hint="Down one layer"
      >
        ⬇ Go backwards
      </MenuItem>
      <MenuItem
        onClick={() => run(onSendToBack)}
        disabled={isBackmost}
        hint="Just above the shirt"
      >
        ⬇⬇ Go to the back
      </MenuItem>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  hint,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] text-[var(--foreground)] transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)] disabled:cursor-not-allowed disabled:text-[var(--muted)] disabled:hover:bg-transparent disabled:hover:text-[var(--muted)]"
    >
      <span>{children}</span>
      {hint && <span className="text-[10px] text-[var(--muted)]">{hint}</span>}
    </button>
  );
}

function PreviewModal({
  design,
  onClose,
}: {
  design: Design;
  onClose: () => void;
}) {
  // Esc closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const label =
    design.name?.trim() && design.name.trim() !== "Untitled design"
      ? design.name
      : design.garment === "tshirt"
      ? "T-shirt"
      : "Shirt";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-3 rounded-3xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <EyeIcon size={20} className="text-[var(--primary)]" />
          <h3 className="truncate text-lg font-bold">{label}</h3>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--background)]"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* The shirt itself, full-bleed without any handles or rings */}
        <div
          className="overflow-hidden rounded-2xl bg-gradient-to-b from-[var(--primary-soft)] to-white p-4"
          style={{ aspectRatio: "400 / 500" }}
        >
          <DesignPreview design={design} className="h-full w-full" />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span>
            {design.garment === "tshirt" ? "T-shirt" : "Shirt"} ·{" "}
            {design.elements.length} element
            {design.elements.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={onClose}
            className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-strong)]"
          >
            Back to editing
          </button>
        </div>
      </div>
    </div>
  );
}

function ShapesModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (variant: ShapeVariant) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-3xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <ShapesIcon size={22} className="text-[var(--primary)]" />
          <h3 className="text-lg font-bold">Pick a shape</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--background)]"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            2D
          </p>
          <div className="grid grid-cols-5 gap-2">
            {SHAPES_2D.map((variant) => (
              <ShapeChip key={variant} variant={variant} onPick={onPick} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
            3D
          </p>
          <div className="grid grid-cols-5 gap-2">
            {SHAPES_3D.map((variant) => (
              <ShapeChip key={variant} variant={variant} onPick={onPick} />
            ))}
          </div>
        </div>

        <p className="text-[11px] text-[var(--muted)]">
          You can change the color and resize after adding.
        </p>
      </div>
    </div>
  );
}

function ShapeChip({
  variant,
  onPick,
}: {
  variant: ShapeVariant;
  onPick: (v: ShapeVariant) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(variant)}
      title={SHAPE_LABELS[variant]}
      className="group flex aspect-square flex-col items-center justify-center rounded-xl bg-[var(--background)] p-2 ring-1 ring-[var(--border)] transition-all hover:-translate-y-0.5 hover:ring-[var(--primary)]"
    >
      <svg viewBox="0 0 100 100" className="h-12 w-12">
        <ShapeNode
          variant={variant}
          cx={50}
          cy={50}
          w={70}
          h={70}
          color="#7c3aed"
          uid={`chip-${variant}`}
        />
      </svg>
      <span className="mt-1 truncate text-[9px] font-semibold text-[var(--muted)] group-hover:text-[var(--primary)]">
        {SHAPE_LABELS[variant]}
      </span>
    </button>
  );
}

function UnsavedChangesModal({
  onCancel,
  onLeave,
  onSaveAndLeave,
}: {
  onCancel: () => void;
  onLeave: () => void;
  onSaveAndLeave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-xl font-bold">Wow there!</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Are you sure you don&apos;t want to save your design?
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveAndLeave}
            className="w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)]"
          >
            Save & leave
          </button>
          <button
            onClick={onLeave}
            className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--background)]"
          >
            Don&apos;t save
          </button>
          <button
            onClick={onCancel}
            className="w-full rounded-xl px-4 py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- subcomponents ----

function ToolButton({
  label,
  Icon,
  onClick,
  active,
}: {
  label: string;
  Icon: (p: { size?: number; className?: string }) => React.JSX.Element;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-colors ${
        active
          ? "bg-[var(--primary)] text-white"
          : "text-[var(--foreground)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
      }`}
    >
      <Icon size={22} />
      {label}
    </button>
  );
}

function SelectionRing({
  cx,
  cy,
  w,
  h,
}: {
  cx: number;
  cy: number;
  w: number;
  h: number;
}) {
  return (
    <rect
      x={cx - w / 2 - 6}
      y={cy - h / 2 - 6}
      width={w + 12}
      height={h + 12}
      fill="none"
      stroke="var(--primary)"
      strokeWidth={1.5}
      strokeDasharray="4 3"
      pointerEvents="none"
      rx={6}
    />
  );
}

interface BBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Render a single element. Used twice in the studio: once unclipped at low
 * opacity (ghost) and once clipped (real). The keyPrefix keeps React keys
 * unique between the two passes. */
function renderElement(
  el: DesignElement,
  selectedId: string | null,
  onPointerDown: (
    e: ReactPointerEvent<SVGElement>,
    el: DesignElement
  ) => void,
  onContextMenu: (
    e: ReactMouseEvent<SVGElement>,
    el: DesignElement
  ) => void,
  keyPrefix: string
) {
  const k = `${keyPrefix}-${el.id}`;
  const t = elementTransform(el);
  if (el.type === "text") {
    return (
      <g key={k} transform={t || undefined}>
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
          style={{ cursor: "move" }}
          onPointerDown={(e) => onPointerDown(e, el)}
          onContextMenu={(e) => onContextMenu(e, el)}
        >
          {el.text}
        </text>
      </g>
    );
  }
  if (el.type === "image") {
    return (
      <g key={k} transform={t || undefined}>
        <image
          href={el.src}
          x={el.x - el.w / 2}
          y={el.y - el.h / 2}
          width={el.w}
          height={el.h}
          preserveAspectRatio="xMidYMid slice"
          style={{ cursor: "move" }}
          onPointerDown={(e) => onPointerDown(e, el)}
          onContextMenu={(e) => onContextMenu(e, el)}
        />
      </g>
    );
  }
  if (el.type === "shape") {
    return (
      <g
        key={k}
        transform={t || undefined}
        style={{ cursor: "move" }}
        onPointerDown={(e) => onPointerDown(e, el)}
        onContextMenu={(e) => onContextMenu(e, el)}
      >
        <ShapeNode
          variant={el.variant}
          cx={el.x}
          cy={el.y}
          w={el.w}
          h={el.h}
          color={el.color}
          uid={k}
        />
      </g>
    );
  }
  const isSelectedStroke = el.id === selectedId;
  return (
    <g key={k} transform={t || undefined}>
      <path
        d={el.d}
        fill="none"
        stroke={el.color}
        strokeWidth={el.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ cursor: "pointer" }}
        onPointerDown={(e) => onPointerDown(e, el)}
        onContextMenu={(e) => onContextMenu(e, el)}
        strokeOpacity={isSelectedStroke ? 0.6 : 1}
      />
    </g>
  );
}

/**
 * Renders the dashed selection ring, the 8 resize handles (4 corners +
 * 4 sides), and the rotation grip with a connecting line. The whole
 * overlay rotates with the selected element so handles stay glued to
 * the visible bbox.
 */
function SelectionOverlay({
  element,
  bbox,
  liveAngle,
  onResizeDown,
  onRotateDown,
}: {
  element: DesignElement;
  bbox: BBox | null;
  liveAngle: number | null;
  onResizeDown: (
    e: ReactPointerEvent<SVGElement>,
    el: DesignElement,
    anchor: "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l"
  ) => void;
  onRotateDown: (e: ReactPointerEvent<SVGElement>, el: DesignElement) => void;
}) {
  if (!bbox) return null;
  const { cx, cy, w, h } = bbox;
  const rot = "rot" in element ? element.rot ?? 0 : 0;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;
  const rotateY = y0 - 30; // grip 30px above top edge

  type Anchor = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l";
  const handles: { x: number; y: number; anchor: Anchor; cursor: string }[] = [
    { x: x0, y: y0, anchor: "tl", cursor: "nwse-resize" },
    { x: cx, y: y0, anchor: "t", cursor: "ns-resize" },
    { x: x1, y: y0, anchor: "tr", cursor: "nesw-resize" },
    { x: x1, y: cy, anchor: "r", cursor: "ew-resize" },
    { x: x1, y: y1, anchor: "br", cursor: "nwse-resize" },
    { x: cx, y: y1, anchor: "b", cursor: "ns-resize" },
    { x: x0, y: y1, anchor: "bl", cursor: "nesw-resize" },
    { x: x0, y: cy, anchor: "l", cursor: "ew-resize" },
  ];

  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      {/* dashed bbox */}
      <rect
        x={x0}
        y={y0}
        width={w}
        height={h}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        pointerEvents="none"
      />
      {/* line to rotation grip */}
      <line
        x1={cx}
        y1={y0}
        x2={cx}
        y2={rotateY + 6}
        stroke="var(--primary)"
        strokeWidth={1.5}
        pointerEvents="none"
      />
      {/* resize handles */}
      {handles.map((handle) => (
        <g key={handle.anchor}>
          <rect
            x={handle.x - 6}
            y={handle.y - 6}
            width={12}
            height={12}
            fill="white"
            stroke="var(--primary)"
            strokeWidth={1.5}
            rx={2}
            style={{ cursor: handle.cursor }}
            onPointerDown={(e) => onResizeDown(e, element, handle.anchor)}
          />
        </g>
      ))}
      {/* rotation handle */}
      <circle
        cx={cx}
        cy={rotateY}
        r={7}
        fill="white"
        stroke="var(--primary)"
        strokeWidth={1.5}
        style={{ cursor: "grab" }}
        onPointerDown={(e) => onRotateDown(e, element)}
      />
      {/* live angle readout */}
      {liveAngle !== null && (
        <g
          pointerEvents="none"
          transform={`rotate(${-rot} ${cx} ${rotateY - 22})`}
        >
          <rect
            x={cx - 22}
            y={rotateY - 36}
            width={44}
            height={18}
            rx={9}
            fill="var(--primary)"
          />
          <text
            x={cx}
            y={rotateY - 23}
            textAnchor="middle"
            fontSize={11}
            fontWeight="bold"
            fill="white"
          >
            {liveAngle}°
          </text>
        </g>
      )}
    </g>
  );
}

function GarmentPicker({ onPick }: { onPick: (g: GarmentType) => void }) {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-[var(--muted)]">
          Creator Studio
        </p>
        <h1 className="mt-1 text-3xl font-bold">Pick a garment</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose what you&apos;d like to design today.
        </p>
      </header>
      <div className="grid grid-cols-2 gap-4">
        {(["tshirt", "shirt"] as const).map((g) => (
          <button
            key={g}
            onClick={() => onPick(g)}
            className="group flex flex-col items-center gap-2 rounded-3xl bg-white p-4 ring-1 ring-[var(--border)] transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-[var(--primary)]"
          >
            <svg viewBox="0 0 400 500" className="h-48 w-full">
              <path
                d={garmentPath(g)}
                fill="#ffffff"
                stroke="rgba(0,0,0,0.2)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <GarmentDetails type={g} />
            </svg>
            <span className="text-sm font-bold uppercase tracking-wider text-[var(--primary)]">
              {g === "tshirt" ? "T-Shirt" : "Shirt"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ElementControls({
  element,
  onPatch,
  onDelete,
  bgRemovingId,
  onRemoveBackground,
}: {
  element: DesignElement;
  onPatch: (id: string, patch: Partial<DesignElement>) => void;
  onDelete: (id: string) => void;
  bgRemovingId: string | null;
  onRemoveBackground: (id: string, src: string) => void;
}) {
  if (element.type === "text") {
    return (
      <div className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Text
          </span>
          <button
            onClick={() => onDelete(element.id)}
            className="ml-auto grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
            aria-label="Delete text"
          >
            <TrashIcon size={16} />
          </button>
        </div>
        <input
          value={element.text}
          onChange={(e) => onPatch(element.id, { text: e.target.value })}
          maxLength={60}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
          placeholder="Type your text…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onPatch(element.id, { color: c })}
                aria-label={`Text color ${c}`}
                className={`h-6 w-6 rounded-full border-2 ${
                  element.color === c
                    ? "border-[var(--primary)] ring-2 ring-[var(--primary-soft)]"
                    : "border-[var(--border)]"
                }`}
                style={{ background: c }}
              />
            ))}
            <ColorWheelButton
              value={element.color}
              onChange={(c) => onPatch(element.id, { color: c })}
              size={6}
              title="Custom text color"
            />
          </div>
          <select
            value={element.font}
            onChange={(e) => onPatch(element.id, { font: e.target.value })}
            className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs"
          >
            {FONTS.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              onPatch(element.id, {
                weight: element.weight === "bold" ? "normal" : "bold",
              })
            }
            className={`rounded-lg px-2 py-1 text-xs font-bold ${
              element.weight === "bold"
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--background)] text-[var(--foreground)] ring-1 ring-[var(--border)]"
            }`}
          >
            B
          </button>
          <button
            onClick={() => onPatch(element.id, { italic: !element.italic })}
            className={`rounded-lg px-2 py-1 text-xs italic ${
              element.italic
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--background)] text-[var(--foreground)] ring-1 ring-[var(--border)]"
            }`}
          >
            I
          </button>
          <label className="ml-auto flex items-center gap-2 text-xs">
            <span className="text-[var(--muted)]">Size</span>
            <input
              type="range"
              min={10}
              max={80}
              value={element.size}
              onChange={(e) =>
                onPatch(element.id, { size: Number(e.target.value) })
              }
            />
            <span className="w-6 text-right tabular-nums">{element.size}</span>
          </label>
        </div>
      </div>
    );
  }
  if (element.type === "image") {
    const isRemoving = bgRemovingId === element.id;
    return (
      <div className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Image · {Math.round(element.w)}×{Math.round(element.h)}px ·{" "}
            {Math.round(element.rot)}°
          </span>
          <button
            onClick={() => onDelete(element.id)}
            className="ml-auto grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
            aria-label="Delete image"
          >
            <TrashIcon size={16} />
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--muted)]">
          Drag a corner to scale, a side to stretch, or the top grip to rotate.
        </p>
        <button
          type="button"
          disabled={isRemoving}
          onClick={() => onRemoveBackground(element.id, element.src)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRemoving ? (
            <>
              <SpinnerIcon size={16} />
              Removing background…
            </>
          ) : (
            <>
              <ScissorsIcon size={16} />
              Remove background
            </>
          )}
        </button>
        {isRemoving && (
          <p className="text-[10px] leading-relaxed text-[var(--muted)]">
            First time can take a minute while the AI model downloads (~30 MB).
            It&apos;s cached after that.
          </p>
        )}
      </div>
    );
  }
  if (element.type === "shape") {
    return (
      <div className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Shape · {SHAPE_LABELS[element.variant]} ·{" "}
            {Math.round(element.rot)}°
          </span>
          <button
            onClick={() => onDelete(element.id)}
            className="ml-auto grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
            aria-label="Delete shape"
          >
            <TrashIcon size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onPatch(element.id, { color: c })}
              aria-label={`Shape color ${c}`}
              className={`h-6 w-6 rounded-full border-2 ${
                element.color === c
                  ? "border-[var(--primary)] ring-2 ring-[var(--primary-soft)]"
                  : "border-[var(--border)]"
              }`}
              style={{ background: c }}
            />
          ))}
          <ColorWheelButton
            value={element.color}
            onChange={(c) => onPatch(element.id, { color: c })}
            size={6}
            title="Custom shape color"
          />
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--muted)]">
          Drag a corner to scale, a side to stretch, or the top grip to rotate.
        </p>
      </div>
    );
  }
  // stroke
  return (
    <div className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-[var(--border)]">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Drawing · {Math.round(element.w)}×{Math.round(element.h)}px ·{" "}
          {Math.round(element.rot ?? 0)}°
        </span>
        <button
          onClick={() => onDelete(element.id)}
          className="ml-auto grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
          aria-label="Delete drawing"
        >
          <TrashIcon size={16} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onPatch(element.id, { color: c })}
            aria-label={`Stroke color ${c}`}
            className={`h-6 w-6 rounded-full border-2 ${
              element.color === c
                ? "border-[var(--primary)] ring-2 ring-[var(--primary-soft)]"
                : "border-[var(--border)]"
            }`}
            style={{ background: c }}
          />
        ))}
        <ColorWheelButton
          value={element.color}
          onChange={(c) => onPatch(element.id, { color: c })}
          size={6}
          title="Custom stroke color"
        />
      </div>
      <p className="text-[10px] leading-relaxed text-[var(--muted)]">
        Drag the drawing to move it. Use the handles to resize and rotate.
      </p>
    </div>
  );
}

function WebSearchModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  /** Receives a portable data: URL ready to embed in a design. */
  onPick: (dataUrl: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BingResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pickingUrl, setPickingUrl] = useState<string | null>(null);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      // `cache: "no-store"` + the unique `_` param guarantee the browser
      // and any intermediate cache treat every query as fresh, so we never
      // accidentally show the previous query's results.
      const res = await fetch(
        `/api/image-search?q=${encodeURIComponent(q)}&_=${Date.now()}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as { images?: BingResult[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setResults(json.images ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function pickResult(r: BingResult) {
    if (pickingUrl) return;
    setPickingUrl(r.full);
    try {
      const dataUrl = await imageUrlToDataUrl(r.full);
      onPick(dataUrl);
    } catch {
      // Try the thumbnail as a fallback (lower quality but more reliable)
      try {
        const dataUrl = await imageUrlToDataUrl(r.thumb);
        onPick(dataUrl);
      } catch {
        alert("Could not load that image. Try another one.");
      }
    } finally {
      setPickingUrl(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <SearchIcon size={22} className="text-[var(--primary)]" />
          <h3 className="text-lg font-bold">Find an image</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--background)]"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {/* Search bar */}
          <form onSubmit={runSearch} className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Search the web
            </label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. galaxy, dragon, basketball logo…"
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
              />
              <button
                type="submit"
                disabled={searching || !query.trim()}
                className="flex items-center gap-1 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {searching ? <SpinnerIcon size={16} /> : <SearchIcon size={16} />}
                Search
              </button>
            </div>
          </form>

          {/* Results */}
          {searching && (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              Searching Bing…
            </p>
          )}
          {searchError && !searching && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
              {searchError}
            </p>
          )}
          {results && !searching && results.length === 0 && !searchError && (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              No results. Try a different search.
            </p>
          )}
          {results && results.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {results.map((r, i) => {
                const isPicking = pickingUrl === r.full;
                return (
                  <button
                    key={`${r.full}-${i}`}
                    type="button"
                    onClick={() => pickResult(r)}
                    disabled={!!pickingUrl}
                    title={r.title || "Add image"}
                    className="group relative aspect-square overflow-hidden rounded-xl bg-[var(--background)] ring-1 ring-[var(--border)] transition-all hover:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/image-proxy?url=${encodeURIComponent(r.thumb)}`}
                      alt={r.title || "result"}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    {isPicking && (
                      <div className="absolute inset-0 grid place-items-center bg-white/70">
                        <SpinnerIcon size={24} className="text-[var(--primary)]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
