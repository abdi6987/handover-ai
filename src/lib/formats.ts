const IMAGE_EXT: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".jfif": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
  ".heic": "image/heic", ".heif": "image/heif", ".hif": "image/heif", ".avif": "image/avif", ".tif": "image/tiff", ".tiff": "image/tiff",
  ".bmp": "image/bmp", ".dng": "image/x-adobe-dng", ".cr2": "image/x-canon-cr2", ".cr3": "image/x-canon-cr3", ".nef": "image/x-nikon-nef",
  ".arw": "image/x-sony-arw", ".orf": "image/x-olympus-orf", ".rw2": "image/x-panasonic-rw2", ".raf": "image/x-fuji-raf", ".svg": "image/svg+xml",
};
const VIDEO_EXT: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/x-m4v", ".mov": "video/quicktime", ".qt": "video/quicktime", ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
  ".webm": "video/webm", ".3gp": "video/3gpp", ".3g2": "video/3gpp2", ".wmv": "video/x-ms-wmv", ".flv": "video/x-flv", ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg", ".mts": "video/mp2t", ".m2ts": "video/mp2t", ".ts": "video/mp2t", ".ogv": "video/ogg", ".hevc": "video/hevc",
};

const AUDIO_EXT: Record<string, string> = {
  ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".aac": "audio/aac", ".wav": "audio/wav", ".ogg": "audio/ogg", ".oga": "audio/ogg",
  ".opus": "audio/ogg", ".amr": "audio/amr", ".3ga": "audio/3gpp", ".caf": "audio/x-caf", ".weba": "audio/webm", ".flac": "audio/flac",
};

/** Work out the real type: browsers often send an empty or generic type for HEIC, MOV, RAW, MKV etc. */
export function detectMime(name: string, browserType: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  if (IMAGE_EXT[ext]) return IMAGE_EXT[ext];
  if (VIDEO_EXT[ext]) return VIDEO_EXT[ext];
  if (AUDIO_EXT[ext]) return AUDIO_EXT[ext];
  if (browserType && browserType !== "application/octet-stream") return browserType;
  return "application/octet-stream";
}

export const isPhotoOrVideo = (mime: string) => mime.startsWith("image/") || mime.startsWith("video/");

/** Formats every modern browser can show directly. Everything else gets a converted preview. */
export const BROWSER_IMAGE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

export const ACCEPT_MEDIA = ["image/*", "video/*", ...Object.keys(IMAGE_EXT), ...Object.keys(VIDEO_EXT)].join(",");
export const ACCEPT_MEDIA_AUDIO = [ACCEPT_MEDIA, "audio/*", ...Object.keys(AUDIO_EXT)].join(",");
