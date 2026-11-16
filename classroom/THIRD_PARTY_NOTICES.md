# Classroom third-party assets

Downloaded and verified on 2026-11-16. Runtime files are bundled unchanged;
the classroom makes no CDN or remote inference requests. Camera frames are
processed in the browser and are not recorded or uploaded by this application.

## Zlice

The classroom lesson adapts the hand-controlled fruit-slicing idea from
[Axwathy/Zlice](https://github.com/Axwathy/Zlice), source snapshot
`c3a90ead8a1274c4a49342cc90d9f5f648eca61d`. Zlice is MIT licensed; its original
copyright and permission text are retained in the repository root `LICENSE`.
The classroom implementation and teaching controls are separate additions.

## MediaPipe Tasks Vision 0.10.14

Copyright Google / The MediaPipe Authors. Apache License 2.0.
The full upstream license, including its additional bundled-code notice,
is retained in [vendor/mediapipe/LICENSE](vendor/mediapipe/LICENSE).

- Official source: [google-ai-edge/mediapipe, v0.10.14](https://github.com/google-ai-edge/mediapipe/tree/v0.10.14).
- Distribution: [`@mediapipe/tasks-vision` 0.10.14 npm archive](https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.14.tgz).
- The archive's package metadata declares `Apache-2.0` and version `0.10.14`.
- The downloaded archive matched the registry's SHA-512 integrity value:
  `sha512-vOifgZhkndgybdvoRITzRkIueWWSiCKuEUXXK6Q4FaJsFvRJuwgg++vqFUMlL0Uox62U5aEXFhHxlhV7Ja5e3Q==`.
- Archive SHA-256: `3122ba7a70d414ffbb3a1bd194c370594a1bf1c90e467c375a5b8bd25be2c004`.
- Both SIMD and non-SIMD WASM variants are retained so the resolver can choose
  according to browser support. Only the selected variant is loaded at runtime.

## MediaPipe Hand Landmarker model

Copyright Google / The MediaPipe Authors. Apache License 2.0; see the
[official Hand Tracking model card, page 2](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf)
and the license copy above. The model is supplied by the
[official Hand Landmarker guide](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker).

- Fixed model variant: `hand_landmarker / float16 / 1` (not `latest`).
- Download: [Google-hosted version 1 model bundle](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task).
- File: `models/hand_landmarker.task`, 7,819,105 bytes.
- The bundle contains `hand_detector.tflite` and `hand_landmarks_detector.tflite`.
- The model detects hand landmarks; it does not identify people or generate game code.

## Bundled file checksums

SHA-256 values, relative to this classroom directory:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `vendor/mediapipe/vision_bundle.mjs` | 136,870 | `e77f281f9619150d937023c355bae170e9120e3b9e43f1e23a2a7bee07197669` |
| `vendor/mediapipe/wasm/vision_wasm_internal.js` | 209,826 | `9440cf0cc0cea21800e31581ec32aeedcc5fbf9df4509796bbc7d3f99e52ab9c` |
| `vendor/mediapipe/wasm/vision_wasm_internal.wasm` | 9,423,986 | `f82a8e6c05e08a44cc9f9e7ec5f845935bcbb1b1500ebe8c2f4812fb4e2917dc` |
| `vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js` | 209,735 | `abe9b6fbeaf86fcb53a5edce3926c82ccb0619e18fed4d9d9ce561ee7f55e054` |
| `vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm` | 9,294,247 | `38b61feab2fd7934e05cbe9f68baa308978a5e3b7f85c1913bb8ae89b8ef8b97` |
| `models/hand_landmarker.task` | 7,819,105 | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |
| `vendor/mediapipe/LICENSE` | 12,331 | `8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8` |

The six runtime assets total 27,093,769 bytes (25.84 MiB). Source maps are
development-only and are not included. The unmodified ESM bundle retains its
upstream source-map comment; opening browser developer tools may request a
missing local source map, which has no effect on the game or offline inference.
