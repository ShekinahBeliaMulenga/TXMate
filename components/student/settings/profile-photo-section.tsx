"use client";

import Image from "next/image";
import { useRef, useState, type ChangeEvent } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ImageCropModal from "@/components/ImageCropModal";
import { initials, requestJson, resizeProfileImage } from "./settings-api";
import { FOCUS, Icon, InfoNote } from "./settings-ui";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Profile photo screen. Self-contained: it validates the file, shows the crop dialog and talks to
 * the profile-image API. The parent only needs to know the new image URL.
 */
export default function ProfilePhotoSection({ name, image, onImageChange }: { name: string; image: string | null; onImageChange: (image: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Step 1: validate the chosen file, then open the crop dialog instead of uploading.
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setSuccess(false);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("The selected image is too large. Maximum size is 10 MB.");
      return;
    }
    setPendingFile(file);
  }

  // Step 2: upload the cropped result. On failure the dialog stays open and shows the error.
  async function uploadCropped(file: File) {
    setError(null);
    setSuccess(false);
    setUploading(true);
    try {
      const dataUrl = await resizeProfileImage(file);
      const body = await requestJson<{ image?: string | null }>(
        "/api/student/profile-image",
        { method: "PUT", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ image: dataUrl }) },
        "Unable to update your profile picture."
      );
      if (typeof body.image !== "string") throw new Error("The profile image service returned an invalid image.");
      onImageChange(body.image);
      setSuccess(true);
      setPendingFile(null);
      setInputKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update your profile picture.");
    } finally {
      setUploading(false);
    }
  }

  function cancelCrop() {
    setPendingFile(null);
    setError(null);
    setInputKey((value) => value + 1);
  }

  async function removeImage() {
    if (!image || uploading) return;
    setConfirmRemove(false);
    setError(null);
    setSuccess(false);
    setUploading(true);
    try {
      await requestJson("/api/student/profile-image", { method: "DELETE", headers: { Accept: "application/json" } }, "Unable to remove your profile picture.");
      onImageChange(null);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove your profile picture.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-4 py-4">
        <div>
          {image ? (
            <Image src={image} alt={name} width={176} height={176} unoptimized className="h-40 w-40 rounded-full object-cover ring-4 ring-white shadow-sm sm:h-44 sm:w-44" />
          ) : (
            <div aria-hidden="true" className="flex h-40 w-40 items-center justify-center rounded-full bg-[#f2e9e4] text-5xl font-semibold text-[#7d1f2a] ring-4 ring-white shadow-sm sm:h-44 sm:w-44">
              {initials(name)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label={image ? "Change profile photo" : "Add profile photo"}
            title={image ? "Change photo" : "Add photo"}
            className={`flex h-10 w-10 items-center justify-center rounded-full bg-[#7d1f2a] text-white shadow-sm transition hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}
          >
            <Icon name="camera" className="h-5 w-5" />
          </button>
          {image ? (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={uploading}
              aria-label="Remove profile photo"
              title="Remove photo"
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-[#e3d9d3] bg-white text-[#7d1f2a] shadow-sm transition hover:bg-[#faeef0] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}
            >
              <Icon name="trash" className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>

      <input key={inputKey} ref={inputRef} type="file" accept={ACCEPTED_TYPES.join(",")} className="sr-only" tabIndex={-1} onChange={handleFileChange} disabled={uploading} />

      {uploading && !pendingFile ? <p role="status" className="mt-2 text-center text-sm text-[#6d6260]">Updating…</p> : null}
      {!pendingFile && error ? <p role="alert" className="mt-4 text-sm leading-5 text-[#7d1f2a]">{error}</p> : null}
      {success ? <p role="status" className="mt-4 text-sm leading-5 text-[#28633b]">Profile picture updated successfully.</p> : null}

      <div className="mt-5">
        <InfoNote>Use a clear photo of yourself. Avoid group photos, filters or images that are not yours.</InfoNote>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title="Remove your profile photo?"
        message="Your initials will be shown instead. You can add a new photo at any time."
        confirmLabel="Remove photo"
        busyLabel="Removing…"
        tone="danger"
        busy={uploading}
        onConfirm={() => void removeImage()}
        onCancel={() => setConfirmRemove(false)}
      />

      {pendingFile ? <ImageCropModal file={pendingFile} busy={uploading} externalError={error} onCancel={cancelCrop} onConfirm={(cropped) => void uploadCropped(cropped)} /> : null}
    </div>
  );
}