"use client";

import { useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

const OUTPUT_SIZE = 512;

async function cropToFile(src: string, area: Area, rotation: number, name: string): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read the selected image."));
    img.src = src;
  });

  // react-easy-crop's pixel area is relative to the rotated image's bounding box
  const rad = (rotation * Math.PI) / 180;
  const bW = Math.round(Math.abs(Math.cos(rad) * image.width) + Math.abs(Math.sin(rad) * image.height));
  const bH = Math.round(Math.abs(Math.sin(rad) * image.width) + Math.abs(Math.cos(rad) * image.height));

  const full = document.createElement("canvas");
  full.width = bW;
  full.height = bH;
  const fctx = full.getContext("2d");
  if (!fctx) throw new Error("Your browser could not prepare the selected image.");
  fctx.translate(bW / 2, bH / 2);
  fctx.rotate(rad);
  fctx.translate(-image.width / 2, -image.height / 2);
  fctx.drawImage(image, 0, 0);

  // Fixed square output, never upscaled beyond the source pixels
  const size = Math.max(1, Math.min(OUTPUT_SIZE, Math.round(Math.min(area.width, area.height))));
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Your browser could not prepare the selected image.");
  octx.imageSmoothingQuality = "high";
  octx.drawImage(full, area.x, area.y, area.width, area.height, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Your browser could not prepare the selected image.");
  return new File([blob], name.replace(/\.\w+$/, "") + ".png", { type: "image/png" });
}

export default function ImageCropModal({
  file,
  busy = false,
  externalError = null,
  onCancel,
  onConfirm,
}: {
  file: File;
  busy?: boolean;
  externalError?: string | null;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  // Create the object URL inside the effect so Strict Mode's double-run is safe
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Esc to close, and lock page scroll while open
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) cancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [busy]);

  async function confirm() {
    if (!area || !src || busy) return;
    setLocalError(null);
    try {
      onConfirm(await cropToFile(src, area, rotation, file.name));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Could not crop the image.");
    }
  }

  const error = localError ?? externalError;

  return (
    <div role="dialog" aria-modal="true" aria-label="Crop profile photo" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b border-[#ece5de] px-5 py-3">
          <h2 className="text-sm font-semibold text-[#282321]">Adjust your photo</h2>
          <p className="mt-0.5 text-xs text-[#7a6f6a]">Drag to reposition and zoom to fit. The circle is what others will see.</p>
        </div>

        <div className="relative h-72 bg-[#282321]">
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={3}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          ) : null}
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="flex items-center gap-3 text-xs font-medium text-[#3f3734]">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              disabled={busy}
              className="flex-1 accent-[#7d1f2a]"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => setRotation((value) => (value - 90 + 360) % 360)} className="rounded-md border border-[#d9cec5] px-3 py-1.5 text-xs font-medium text-[#4e4742] hover:bg-[#faf8f6] disabled:opacity-60">
              Rotate left
            </button>
            <button type="button" disabled={busy} onClick={() => setRotation((value) => (value + 90) % 360)} className="rounded-md border border-[#d9cec5] px-3 py-1.5 text-xs font-medium text-[#4e4742] hover:bg-[#faf8f6] disabled:opacity-60">
              Rotate right
            </button>
          </div>
          {error ? <p role="alert" className="text-xs text-[#7d1f2a]">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#ece5de] bg-[#fbf9f7] px-5 py-3">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-md border border-[#d9cec5] px-4 py-2 text-sm font-medium text-[#4e4742] hover:bg-white disabled:opacity-60">
            Cancel
          </button>
          <button type="button" disabled={busy || !area || !src} onClick={() => void confirm()} className="rounded-md bg-[#7d1f2a] px-5 py-2 text-sm font-semibold text-white hover:bg-[#691923] disabled:opacity-60">
            {busy ? "Uploading…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}