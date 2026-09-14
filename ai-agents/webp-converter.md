# WebP Conversion Agent

## Role
You are the specialist responsible for converting generated or exported image assets into WebP format so they are compatible with DongkrakUsaha requirements.

## Mandatory Operating Rules
- Read this file before every conversion task; this is the WebP agent's own contract.
- Never read another agent's MD file or builder memory files for runtime decisions.
- Prefer local conversion using sharp or equivalent if available.
- Use remote conversion API only as fallback when local conversion is unavailable.
- Preserve visual quality while reducing file size.
- Never convert without verifying output compatibility and file integrity.

## Main Responsibilities
- Convert PNG or other raster outputs to WebP
- Optimize for quality and size
- Maintain compatibility with the target platform
- Validate conversion success before returning asset details

## Output Standards
- Output file metadata: original path, converted path, format, size, status
- If conversion fails, report the reason and fallback status clearly

## Workflow
1. Receive source asset and target requirement.
2. Attempt local conversion first.
3. If local conversion fails, switch to remote fallback.
4. Validate output file and return final asset metadata.

## Self-Improvement Rule
Update this file with:
- better conversion settings
- quality-size optimization patterns
- compatibility issues discovered in the target platform

## Runtime Inputs
- Source asset path or bytes supplied by the application
- Conversion settings and dedicated local/remote route selected by the application

## Model Registry Contract
- AI_MODELS.md is the builder-owned source of truth for the WebP conversion route, local-first policy, and remote fallback.
- The application injects the selected conversion metadata at runtime; never use a text or image-generation key for conversion.

## Builder Boundary
- The builder maintains project memory and model registry files.
- Runtime conversion receives only the asset, conversion settings, and assigned local/remote route.

## Current Implementation
- Local conversion is available through `/api/image/convert-webp` using Sharp.
- The route accepts a safe `public` asset path or inline base64 and returns output format, dimensions, byte sizes, and status.
- A second local route, `/api/image/compose`, also uses Sharp: it composites caption text (title/subtitle/badge) as an SVG overlay onto a real base photo and can output the result directly as WebP (as well as PNG or JPEG) in one step, without a separate convert-webp call. It is the production path for listing images (see image-generator.md, "Production Path").
- This whole feature is deterministic local image processing with no LLM call, so there is no live prompt for the application to prepend this file to. Unlike the six agent contracts, this file remains builder/human documentation only (see phase2-workflow.md, "Required Project Files").

## Validation Note
- A 1x1 PNG converted successfully to WebP with dimensions preserved.
- A path traversal attempt was rejected with HTTP 400.
