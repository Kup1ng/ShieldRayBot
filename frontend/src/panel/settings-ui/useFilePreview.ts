"use client";

import { useEffect, useState } from "react";

/** A data URL to preview a chosen image before it is saved ("" until it is read). */
export function useFilePreview(file: File | undefined): string {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) return;
    let active = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (active) setPreview({ file, url: String(reader.result) });
    };
    reader.readAsDataURL(file);
    return () => {
      active = false;
    };
  }, [file]);
  return file && preview?.file === file ? preview.url : "";
}
