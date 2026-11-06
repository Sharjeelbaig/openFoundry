#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Sharjeel Baig
"""Capture a physical speaker-to-microphone AEC fixture.

This is the evidence harness for the acoustic-room test. It records the
built-in microphone while a TTS reference plays through the built-in speakers,
then writes a 16 kHz WAV pair and the measured alignment offset.

Requirements: macOS, `say`, `afplay`, `ffmpeg`, and Python packages
`sounddevice` and `numpy` (install into a temporary venv, not the app).

The default capture latency matters: AVFoundation/PortAudio can drop samples
at low latency, which warps the timeline and makes the echo uncorrelatable.
`latency="high"` keeps the click intervals at exactly 500 ms on this machine.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

import numpy as np
import sounddevice as sd


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as handle:
        frames = handle.getnframes()
        channels = handle.getnchannels()
        data = np.frombuffer(handle.readframes(frames), dtype="<i2")
        audio = data.astype(np.float32) / 32768.0
        if channels > 1:
            audio = audio.reshape(-1, channels).mean(axis=1)
        return audio, handle.getframerate()


def write_wav(path: Path, samples: np.ndarray, rate: int) -> None:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(pcm.tobytes())


def main() -> None:
    text = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "The quick brown fox jumps over the lazy dog. The vault code is 4417."
    )
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "tests/fixtures/physical-aec")
    out.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp:
        ref22 = Path(temp) / "ref-22k.wav"
        ref16 = out / "reference-16k.wav"
        rec48 = Path(temp) / "rec-48k.wav"
        rec16 = out / "recording-16k.wav"

        subprocess.run(
            ["say", "-o", str(ref22), "--data-format=LEI16@22050", text],
            check=True,
        )
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(ref22),
                "-ar",
                "16000",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                str(ref16),
            ],
            check=True,
        )

        rate = 48000
        recording = sd.rec(
            int(10 * rate),
            samplerate=rate,
            channels=1,
            device=0,
            dtype="int16",
            latency="high",
        )
        time.sleep(1.0)
        subprocess.run(["afplay", str(ref22)], check=True)
        sd.wait()
        audio = recording[:, 0].astype(np.float32) / 32768.0
        write_wav(rec48, audio, rate)
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(rec48),
                "-ar",
                "16000",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                str(rec16),
            ],
            check=True,
        )

    rec, rec_rate = read_wav(rec16)
    ref, ref_rate = read_wav(ref16)
    if rec_rate != 16000 or ref_rate != 16000:
        raise SystemExit("Expected 16 kHz WAV files.")

    # Coarse FFT cross-correlation, then a direct normalized refinement around
    # the peak. This is the playback offset, not the acoustic path delay.
    nfft = 1 << int(np.ceil(np.log2(len(rec) + len(ref))))
    corr = np.fft.irfft(
        np.fft.rfft(rec, nfft) * np.conj(np.fft.rfft(ref, nfft)), nfft
    )[: len(rec)]
    coarse = int(np.argmax(np.abs(corr)))
    window = 3200
    best = coarse
    best_score = -1.0
    for lag in range(max(0, coarse - 200), min(len(rec) - window, coarse + 200)):
        a = rec[lag : lag + window]
        b = ref[:window]
        score = abs(float((a * b).sum())) / np.sqrt(
            (a * a).sum() * (b * b).sum() + 1e-9
        )
        if score > best_score:
            best = lag
            best_score = score

    start = best + int(0.5 * 16000)
    end = min(len(rec), best + len(ref) - int(0.2 * 16000))
    mic_rms = float(np.sqrt((rec[start:end] ** 2).mean()))
    ambient_rms = float(np.sqrt((rec[-16000:] ** 2).mean()))
    meta = {
        "capture": {
            "device": "MacBook Pro Microphone",
            "sampleRate": 48000,
            "captureRate": 16000,
            "api": "sounddevice/CoreAudio, latency=high",
            "playback": "afplay, system output volume 90",
            "room": "same desk, built-in speakers to built-in mic",
            "text": text,
        },
        "alignmentSamples": best,
        "alignmentMs": round(best / 16, 2),
        "alignmentCorrelation": round(best_score, 4),
        "referenceSamples": len(ref),
        "recordingSamples": len(rec),
        "micRms": round(mic_rms, 6),
        "ambientRms": round(ambient_rms, 6),
        "echoToAmbientDb": round(20 * np.log10(mic_rms / ambient_rms), 2),
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
