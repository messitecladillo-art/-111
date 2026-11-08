# Report writing apparatus — Anatomy integration

Visual mode: `agent_ui`. This is a conceptual illustration of actual application task states, not research evidence or an exported report figure.

- Upstream: https://github.com/wheresryan22/anatomy
- Frozen revision: `1482e8469b0a9e0d8cc18ea2740a01423d29ae80`
- License: MIT, Copyright (c) 2026 Ryan; original notice is in `vendor/LICENSE`.
- `vendor/iso-kit.ts` is copied byte-for-byte from `kit/iso-kit.ts` at that revision.
- Upstream file SHA-256 (original LF bytes): `e9fc988c61a11bfac1f097e62419915ea86b2130ab091f1b50c0e019c907e253`.
- The local `Solid` React renderer is adapted from the same revision's `kit/react/draw.tsx`.
- `geometry.ts`, component, scoped styles and the report-press composition are original EVI-X work. No upstream example artwork or demo output is copied.

The kit supplies actual isometric projection, extruded surfaces, shading, cylinder and ruler geometry. CSS is scoped locally instead of importing the kit's global stylesheet. No WebGL, image generation, model API call or new package is required. Static parts are computed once at module load; visual motion never advances application state.

Task state and counts arrive through `ReportWorkState`; all three active phases pause offscreen, in a hidden document, or under reduced motion. Error, waiting and completed states have no repeating motion. The inspection button only separates visual assemblies. The component is screen-only and must not be persisted in `EditorContent` or any report export.

The drawing is a compact conceptual UI figure. It has not been certified as a mechanically buildable machine or passed Anatomy’s full engineering collision audit; no such claim is made.
