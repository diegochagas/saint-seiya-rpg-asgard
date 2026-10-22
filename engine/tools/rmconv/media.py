"""Image, audio and movie conversion to browser formats (PNG, OGG, WebM)."""
from __future__ import annotations

import struct
import subprocess
import wave

from PIL import Image

MIDI_RATE = 44100
MIDI_TAIL_SECONDS = 1.5  # keep rendering after the last note so reverb tails are not cut
MIDI_CHUNK = 4096


def _palette_alpha(src: str) -> Image.Image:
    """RPG Maker 2000/2003: palette index 0 is the transparent colour."""
    indexed = Image.open(src)
    return indexed.point(lambda i: 0 if i == 0 else 255, mode="L")


def convert_image(src: str, dst: str, transparent: bool) -> tuple[int, int]:
    """Example: convert_image("CharSet/Hero.png", "assets/charset/hero.png", True) -> (288, 256)"""
    im = Image.open(src)
    if im.mode == "P" and transparent:
        im = im.convert("RGBA")
        im.putalpha(_palette_alpha(src))
    elif im.mode == "P":
        im = im.convert("RGB")
    elif transparent and im.mode != "RGBA":
        im = im.convert("RGBA")
    im.save(dst, optimize=True)
    return im.size


def _synth_frames(src: str, sf2: str, seconds_max: int) -> bytes:
    import tinysoundfont as tsf

    synth = tsf.Synth(gain=-6.0, samplerate=MIDI_RATE)
    synth.sfload(sf2)
    seq = tsf.Sequencer(synth)
    seq.midi_load(src)
    frames, total, tail = [], 0, 0
    while total < MIDI_RATE * seconds_max and tail < MIDI_RATE * MIDI_TAIL_SECONDS:
        frames.append(bytes(synth.generate(MIDI_CHUNK)))
        total += MIDI_CHUNK
        if seq.is_empty():
            tail += MIDI_CHUNK
    return b"".join(frames)


def render_midi(src: str, wav_out: str, sf2: str, seconds_max: int = 600) -> None:
    """Render a MIDI file with a GM SoundFont into a 16-bit stereo WAV."""
    raw = _synth_frames(src, sf2, seconds_max)
    n = len(raw) // 4
    floats = struct.unpack("<%df" % n, raw[: n * 4])
    ints = struct.pack("<%dh" % n, *[max(-32768, min(32767, int(v * 32767))) for v in floats])
    with wave.open(wav_out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(MIDI_RATE)
        w.writeframes(ints)


def _ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def to_ogg(src: str, dst: str, quality: str = "4") -> None:
    """Vorbis quality 4 for sound effects; MIDI renders use 1 (see export._audio), which keeps the
    music folder at about half the size (205 MB -> 108 MB for Holy Avenger)."""
    _ffmpeg(["-i", src, "-c:a", "libvorbis", "-q:a", quality, dst])


def to_webm(src: str, dst: str) -> None:
    """RPG Maker movies (AVI/MPEG) -> VP9 + Opus WebM, playable in every current browser."""
    _ffmpeg(["-i", src, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "36", "-row-mt", "1",
             "-c:a", "libopus", "-b:a", "96k", dst])
