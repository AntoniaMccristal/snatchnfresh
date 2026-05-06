import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";

interface AvatarCropperProps {
  imageSrc: string;
  onSave: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

const OUTPUT_SIZE = 512;
const MIN_CROP = 80;

export default function AvatarCropper({ imageSrc, onSave, onCancel }: AvatarCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [crop, setCrop] = useState({ x: 0, y: 0, size: 200 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const dragging = useRef<null | "image" | "crop" | "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r">(null);
  const dragStart = useRef({ mx: 0, my: 0, ix: 0, iy: 0, cx: 0, cy: 0, cs: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  useEffect(() => {
    if (!loaded || containerSize.w === 0 || imgSize.w === 0) return;
    const { w: cw, h: ch } = containerSize;
    const scale = Math.min(cw / imgSize.w, ch / imgSize.h) * 0.9;
    setZoom(scale);
    const iw = imgSize.w * scale;
    const ih = imgSize.h * scale;
    const ix = (cw - iw) / 2;
    const iy = (ch - ih) / 2;
    setImgOffset({ x: ix, y: iy });
    const cropSize = Math.min(iw, ih) * 0.75;
    setCrop({ x: ix + (iw - cropSize) / 2, y: iy + (ih - cropSize) / 2, size: cropSize });
  }, [loaded, containerSize, imgSize]);

  function getClient(e: React.MouseEvent | React.TouchEvent) {
    if ("touches" in e) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function getHandle(mx: number, my: number): typeof dragging.current {
    const { x, y, size } = crop;
    const H = 14;
    const nearL = Math.abs(mx - x) < H;
    const nearR = Math.abs(mx - x - size) < H;
    const nearT = Math.abs(my - y) < H;
    const nearB = Math.abs(my - y - size) < H;
    const inX = mx >= x - H && mx <= x + size + H;
    const inY = my >= y - H && my <= y + size + H;
    if (nearL && nearT) return "tl";
    if (nearR && nearT) return "tr";
    if (nearL && nearB) return "bl";
    if (nearR && nearB) return "br";
    if (nearT && inX) return "t";
    if (nearB && inX) return "b";
    if (nearL && inY) return "l";
    if (nearR && inY) return "r";
    if (inX && inY) return "crop";
    return "image";
  }

  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    const rect = containerRef.current!.getBoundingClientRect();
    const { x: mx, y: my } = getClient(e);
    const lx = mx - rect.left;
    const ly = my - rect.top;
    dragging.current = getHandle(lx, ly);
    dragStart.current = { mx: lx, my: ly, ix: imgOffset.x, iy: imgOffset.y, cx: crop.x, cy: crop.y, cs: crop.size };
  }

  const onPointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging.current) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const { x: mx, y: my } = getClient(e);
    const lx = mx - rect.left;
    const ly = my - rect.top;
    const dx = lx - dragStart.current.mx;
    const dy = ly - dragStart.current.my;
    const { cx, cy, cs, ix, iy } = dragStart.current;
    const { w: cw, h: ch } = containerSize;

    if (dragging.current === "image") {
      setImgOffset({ x: ix + dx, y: iy + dy });
      return;
    }
    if (dragging.current === "crop") {
      setCrop((prev) => ({ ...prev, x: Math.max(0, Math.min(cw - prev.size, cx + dx)), y: Math.max(0, Math.min(ch - prev.size, cy + dy)) }));
      return;
    }

    let nx = cx, ny = cy, ns = cs;
    if (dragging.current === "br") { ns = Math.max(MIN_CROP, cs + Math.max(dx, dy)); }
    else if (dragging.current === "tr") { ns = Math.max(MIN_CROP, cs + Math.max(dx, -dy)); ny = cy + cs - ns; }
    else if (dragging.current === "bl") { ns = Math.max(MIN_CROP, cs + Math.max(-dx, dy)); nx = cx + cs - ns; }
    else if (dragging.current === "tl") { ns = Math.max(MIN_CROP, cs + Math.max(-dx, -dy)); nx = cx + cs - ns; ny = cy + cs - ns; }
    else if (dragging.current === "r" || dragging.current === "b") { ns = Math.max(MIN_CROP, cs + Math.max(dx, dy)); }
    else if (dragging.current === "l") { ns = Math.max(MIN_CROP, cs - dx); nx = cx + cs - ns; }
    else if (dragging.current === "t") { ns = Math.max(MIN_CROP, cs - dy); ny = cy + cs - ns; }

    nx = Math.max(0, Math.min(cw - ns, nx));
    ny = Math.max(0, Math.min(ch - ns, ny));
    setCrop({ x: nx, y: ny, size: ns });
  }, [containerSize]);

  function onPointerUp() { dragging.current = null; }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) => Math.max(0.05, Math.min(10, z + (e.deltaY > 0 ? -0.05 : 0.05))));
  }

  async function handleSave() {
    const img = imageRef.current;
    if (!img || containerSize.w === 0) return;
    setSaving(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d")!;
    const ratio = OUTPUT_SIZE / crop.size;
    const relX = (imgOffset.x - crop.x) * ratio;
    const relY = (imgOffset.y - crop.y) * ratio;
    const drawW = imgSize.w * zoom * ratio;
    const drawH = imgSize.h * zoom * ratio;
    ctx.fillStyle = "#1a0a2e";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.save();
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-OUTPUT_SIZE / 2, -OUTPUT_SIZE / 2);
    ctx.drawImage(img, relX, relY, drawW, drawH);
    ctx.restore();
    canvas.toBlob((blob) => { if (blob) onSave(blob); setSaving(false); }, "image/jpeg", 0.92);
  }

  const iw = imgSize.w * zoom;
  const ih = imgSize.h * zoom;

  const toolBtn: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.08)",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0, color: "#fff",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#111", display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#1a1a1a", flexShrink: 0 }}>
        <button onClick={onCancel} style={{ ...toolBtn, background: "transparent", border: "none" }}>
          <X size={18} />
        </button>
        <p style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>Crop photo</p>
        <button onClick={handleSave} disabled={saving || !loaded} style={{
          height: 34, padding: "0 18px", borderRadius: 17,
          background: "#fff", color: "#1a0a2e",
          border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
          opacity: saving ? 0.6 : 1,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Check size={13} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: "relative", overflow: "hidden", userSelect: "none", touchAction: "none", background: "#222", cursor: "crosshair" }}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
        onWheel={onWheel}
      >
        {loaded && (
          <>
            {/* Checkerboard background (shows transparency) */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              backgroundImage: "linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
            }} />

            {/* Image */}
            <div style={{
              position: "absolute", left: imgOffset.x, top: imgOffset.y,
              width: iw, height: ih,
              transform: `rotate(${rotation}deg)`, transformOrigin: "center center",
              pointerEvents: "none",
            }}>
              <img src={imageSrc} style={{ width: "100%", height: "100%", display: "block" }} draggable={false} />
            </div>

            {/* Dark overlay outside crop */}
            <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} width={containerSize.w} height={containerSize.h}>
              <defs>
                <mask id="crop-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x={crop.x} y={crop.y} width={crop.size} height={crop.size} fill="black" />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#crop-mask)" />
            </svg>

            {/* Crop box */}
            <div style={{
              position: "absolute", left: crop.x, top: crop.y,
              width: crop.size, height: crop.size,
              border: "1.5px solid rgba(255,255,255,0.9)",
              boxSizing: "border-box", pointerEvents: "none",
            }}>
              {/* Grid thirds */}
              {[1, 2].map((i) => (
                <div key={`v${i}`} style={{ position: "absolute", left: `${(i / 3) * 100}%`, top: 0, width: 1, height: "100%", background: "rgba(255,255,255,0.3)" }} />
              ))}
              {[1, 2].map((i) => (
                <div key={`h${i}`} style={{ position: "absolute", top: `${(i / 3) * 100}%`, left: 0, height: 1, width: "100%", background: "rgba(255,255,255,0.3)" }} />
              ))}

              {/* Corner brackets */}
              {[
                { top: 0, left: 0, borderTop: "3px solid #fff", borderLeft: "3px solid #fff" },
                { top: 0, right: 0, borderTop: "3px solid #fff", borderRight: "3px solid #fff" },
                { bottom: 0, left: 0, borderBottom: "3px solid #fff", borderLeft: "3px solid #fff" },
                { bottom: 0, right: 0, borderBottom: "3px solid #fff", borderRight: "3px solid #fff" },
              ].map((s, i) => (
                <div key={i} style={{ position: "absolute", width: 18, height: 18, ...s }} />
              ))}

              {/* Edge midpoints */}
              {[
                { top: "50%", left: "50%", transform: "translate(-50%,-50%) translateY(-50%)", width: 24, height: 5 },
                { top: "50%", left: "50%", transform: "translate(-50%,-50%) translateY(calc(50% + 0px))", width: 24, height: 5 },
                { top: "50%", left: 0, transform: "translateY(-50%)", width: 5, height: 24 },
                { top: "50%", right: 0, transform: "translateY(-50%)", width: 5, height: 24 },
              ].map((s, i) => (
                <div key={`em${i}`} style={{ position: "absolute", background: "rgba(255,255,255,0.7)", borderRadius: 3, ...s }} />
              ))}
            </div>
          </>
        )}
        {!loaded && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            Loading...
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 12, padding: "12px 20px 28px", background: "#1a1a1a", flexShrink: 0,
      }}>
        <button onClick={() => setZoom((z) => Math.max(0.05, z - 0.1))} style={toolBtn}><ZoomOut size={18} /></button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 220 }}>
          <input
            type="range" min={5} max={500} step={1}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
            style={{ flex: 1, accentColor: "#fff", height: 4 }}
          />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", minWidth: 36, textAlign: "right" }}>
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <button onClick={() => setZoom((z) => Math.min(10, z + 0.1))} style={toolBtn}><ZoomIn size={18} /></button>
        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />
        <button onClick={() => setRotation((r) => (r + 90) % 360)} style={toolBtn}><RotateCw size={18} /></button>
      </div>
    </div>
  );
}
