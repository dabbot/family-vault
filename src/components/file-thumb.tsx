import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, FileImage, FileVideo, FileAudio, File as FileIcon } from "lucide-react";
import { cn, resolveMimeType } from "@/lib/utils";
import { renderPdfThumbnail } from "@/lib/pdf-preview";

type Props = {
  storagePath: string;
  mimeType: string | null;
  className?: string;
};

const urlCache = new Map<string, string>();
const previewCache = new Map<string, string>();

export function FileThumb({ storagePath, mimeType, className }: Props) {
  const effectiveMime = resolveMimeType(mimeType, storagePath);
  const isImage = (effectiveMime ?? "").startsWith("image/");
  const isPdf = effectiveMime === "application/pdf";
  const [preview, setPreview] = useState<string | null>(() => previewCache.get(storagePath) ?? null);

  useEffect(() => {
    if (!isImage && !isPdf) return;
    if (previewCache.has(storagePath)) { setPreview(previewCache.get(storagePath)!); return; }
    let active = true;
    (async () => {
      let signed = urlCache.get(storagePath);
      if (!signed) {
        const { data } = await supabase.storage.from("documents").createSignedUrl(storagePath, 3600);
        if (!data?.signedUrl) return;
        signed = data.signedUrl;
        urlCache.set(storagePath, signed);
      }
      if (isImage) {
        previewCache.set(storagePath, signed);
        if (active) setPreview(signed);
        return;
      }
      if (isPdf) {
        const dataUrl = await renderPdfThumbnail(signed, 240);
        if (dataUrl) {
          previewCache.set(storagePath, dataUrl);
          if (active) setPreview(dataUrl);
        }
      }
    })();
    return () => { active = false; };
  }, [storagePath, isImage, isPdf]);

  const Icon = !effectiveMime
    ? FileIcon
    : effectiveMime.startsWith("image/")
      ? FileImage
      : effectiveMime.startsWith("video/")
        ? FileVideo
        : effectiveMime.startsWith("audio/")
          ? FileAudio
          : FileText;

  if ((isImage || isPdf) && preview) {
    return (
      <div className={cn("h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted", className)}>
        <img src={preview} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
    );
  }

  return (
    <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground", className)}>
      <Icon className="h-5 w-5" />
    </div>
  );
}
