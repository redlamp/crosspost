"use client"

import type { CropRect } from "@/lib/images"
import type { Span } from "@/lib/trim"

// Trimming and cropping a video in the browser, with Mediabunny (WebCodecs): nothing leaves the
// device. It's loaded only when an edit is saved, so the page doesn't carry it. The result is an
// MP4 in H.264 and AAC, the pairing every platform takes; where this browser can't encode those
// (Firefox on some systems), whatever MP4 it can make.

/** Where `crop` (fractions) lands in a `width` by `height` video, in whole, even pixels (H.264 wants even sizes). */
export function pixelCrop(crop: CropRect, width: number, height: number) {
  const even = (v: number) => Math.round(v / 2) * 2
  // Sizes round down to even when the rounding would run past the frame.
  const fit = (size: number, from: number, room: number) => Math.max(2, Math.min(even(size), room - from - ((room - from) % 2)))
  const left = Math.min(even(crop.x * width), width - 2)
  const top = Math.min(even(crop.y * height), height - 2)
  return { left, top, width: fit(crop.w * width, left, width), height: fit(crop.h * height, top, height) }
}

/** Standard sizes a video can be made smaller to, by its short side: 1080p, 720p, 480p. */
export const VIDEO_SIZES = [1080, 720, 480]

/** The standard sizes smaller than a `width` by `height` picture (none larger: that would only blur it). */
export const sizesBelow = (width: number, height: number) => VIDEO_SIZES.filter((s) => s < Math.min(width, height))

/**
 * A `width` by `height` picture with its short side at `short` pixels (or as it is, when that
 * isn't smaller), in even pixels.
 */
export function scaledSize(width: number, height: number, short?: number) {
  const scale = short && short < Math.min(width, height) ? short / Math.min(width, height) : 1
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)
  return { width: even(width * scale), height: even(height * scale) }
}

/** The audio bitrate the estimates count on: AAC at 128 kbps, as most phone videos carry. */
export const AUDIO_BITRATE = 128_000

/** Mediabunny's own H.264 bitrate at its "high" quality for a `width` by `height` picture (its formula). */
function highBitrate(width: number, height: number) {
  const factor = 0.3 * Math.exp(2.5538 * 0.75)
  return 3_000_000 * Math.pow((width * height) / (1920 * 1080), 0.95) * factor
}

/** What the estimates need to know of the video as added. */
export type SourceInfo = { bytes: number; duration: number; width: number; height: number }

/**
 * The video bitrate an edit is made at, for a `width` by `height` result: Mediabunny's "high" for
 * that size, but never more per pixel than the video as added already spends (re-encoding can't
 * add detail, only bytes). A set bitrate also makes the result's size predictable, so it can be
 * estimated before it's made.
 */
export function targetBitrate(out: { width: number; height: number }, source: SourceInfo): number {
  const sourceVideo = Math.max(100_000, (source.bytes * 8) / Math.max(source.duration, 0.1) - AUDIO_BITRATE)
  const perPixel = Math.pow((out.width * out.height) / (source.width * source.height), 0.95)
  return Math.round(Math.min(highBitrate(out.width, out.height), sourceVideo * perPixel))
}

/**
 * About how many bytes `seconds` of a video at `bitrate` (with its audio) comes to. Encoders run
 * a little over the bitrate they're given (a 30-second 720p test came out 13% over), so it leans
 * 10% high rather than low: better a pleasant surprise near a platform's size limit.
 */
export const estimateBytes = (bitrate: number, seconds: number) => (1.1 * (bitrate + AUDIO_BITRATE) * seconds) / 8

export type VideoEdit = {
  /** Fractions of the frame; omit for all of it. */
  crop?: CropRect
  /** Seconds into the video; omit for all of it. */
  trim?: Span
  /** The short side to make it, in pixels (a standard size: 1080, 720 or 480); omit to keep its size. */
  resize?: number
  /** The video's size in display pixels, which the crop is measured against. */
  size: { width: number; height: number }
  /** The video's length in seconds, for its bitrate. */
  duration: number
}

/**
 * The part of `source` the edit keeps, as an MP4. `onProgress` gets 0 to 1; aborting `signal`
 * stops it, rejecting with an AbortError.
 */
export async function renderVideo(
  source: Blob,
  edit: VideoEdit,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, Quality } = await import(
    "mediabunny"
  )
  const crop = edit.crop && pixelCrop(edit.crop, edit.size.width, edit.size.height)
  const kept = crop ?? edit.size
  // Smaller, by its short side: both sides given, even, as the picture's own shape.
  const resize = edit.resize ? { ...scaledSize(kept.width, kept.height, edit.resize), fit: "fill" as const } : {}
  const out = scaledSize(kept.width, kept.height, edit.resize)
  const quality = new Quality({
    bitrate: targetBitrate(out, { bytes: source.size, duration: edit.duration, ...edit.size }),
  })
  const start = async (strict: boolean) => {
    const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS })
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
    try {
      const conversion = await Conversion.init({
        input,
        output,
        trim: edit.trim,
        video: { crop, ...resize, quality, ...(strict && { codec: "avc" as const }) },
        audio: strict ? { codec: "aac" } : {},
        // Copy what can be copied, but only when the cut lands exactly where asked, so the result
        // is as long as the timeline said (a copy would otherwise widen it to the nearest key frame).
        copy: { boundaryTolerance: 0 },
        showWarnings: false,
      })
      return { conversion, output, input }
    } catch (err) {
      // A file it can't read (an unknown container): let the input go before saying so.
      input.dispose()
      throw err
    }
  }
  let run = await start(true)
  // This browser can't encode H.264 or AAC: let it pick what it can.
  if (run.conversion.discardedTracks.some((t) => t.reason === "no_encodable_target_codec")) {
    run.input.dispose()
    run = await start(false)
  }
  const { conversion, output, input } = run
  // Valid with its picture dropped (one the browser plays but can't decode here) would make a file
  // of sound alone: refuse rather than put that in the video's place.
  if (!conversion.isValid || !conversion.utilizedTracks.some((t) => t.isVideoTrack())) {
    input.dispose()
    throw new Error("This browser can't read this video's picture to make it.")
  }
  conversion.onProgress = (p) => onProgress(p)
  const stop = () => void conversion.cancel()
  signal.addEventListener("abort", stop)
  try {
    if (signal.aborted) throw new DOMException("Canceled", "AbortError")
    await conversion.execute()
  } catch (err) {
    if (signal.aborted) throw new DOMException("Canceled", "AbortError")
    throw err
  } finally {
    signal.removeEventListener("abort", stop)
    input.dispose()
  }
  return new Blob([output.target.buffer!], { type: "video/mp4" })
}

/** The video's frame rate, from its first hundred frames; undefined where it can't be read. */
export async function readFrameRate(source: Blob): Promise<number | undefined> {
  const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny")
  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    const rate = track && (await track.computePacketStats(100)).averagePacketRate
    return rate && Number.isFinite(rate) && rate > 1 ? rate : undefined
  } catch {
    return undefined
  } finally {
    input.dispose()
  }
}
