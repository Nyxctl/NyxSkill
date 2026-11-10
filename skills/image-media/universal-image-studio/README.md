# Universal Image Studio 1.0.0

## Codex

Use the installed NyxSkill Codex adapter, or copy this entire folder to a new
`.agents/skills/universal-image-studio/` in the target project. Keep its contents
together. Open the project in Codex and invoke `$universal-image-studio` with an
image task. The NyxSkill router can also select this workflow for a matching Codex image task. Native generation and editing depend on the tools in that session.

## ChatGPT

Create or open a Project. Paste [Project Instructions](chatgpt/project-instructions.md)
in project settings. Upload [Shared Core](references/core.md) and, for RimWorld
menu work, the [optional profile](profiles/rimworld-menu-background.md). Attach the
actual source and relevant references to the job. Check which files the chat can
open. For large libraries, run local inventory first and upload the inventory and
selected images. A local path in the inventory is not a ChatGPT attachment.
The Project workflow uses instructions and files rather than installing the Codex folder.

If the session offers built-in image editing, use it for the candidate. Download the
candidate, align it to source coordinates and apply the approved mask locally.
A session with a compatible execution environment may run the same Python helper on
uploaded files. There is no automatic file sync or paid API fallback.

## Offline helpers

Requires Python 3.11+ and Pillow (tested with 12.2.0). From this folder:

```text
python scripts/studio.py inventory PATH_TO_IMAGES
python scripts/studio.py inspect SOURCE.png
python scripts/studio.py composite SOURCE.png CANDIDATE.png MASK.png RESULT.png
python scripts/studio.py verify SOURCE.png RESULT.png MASK.png
python scripts/studio.py preview RESULT.png PREVIEW.png 35
```

Inventory reports Pillow-supported image extensions, unreadable inputs, dimensions
and SHA-256. Select roles per job in [the job template](templates/job.json).
Pass a directory containing the intended originals and references. Keep output files
in a separate directory. Linked directories are skipped. The CLI takes local paths
and makes no network calls.

For compositing, source, full-frame candidate and grayscale mask must have identical
displayed dimensions after EXIF orientation. Use matching color spaces. Black
preserves the source RGBA values exactly, white selects candidate pixels, and gray
blends. Keep protected subject pixels black, including the edges you must retain.
Review the candidate and mask at full size before compositing. PNG export
increments the filename on collision. Pixel QA compares decoded RGBA, including
alpha, outside the mask. Visual identity, seam quality and UI readability require
separate review. Preview shades the requested right-hand percentage for visual UI review.

References: [Codex skills](https://developers.openai.com/blog/skills-agents-sdk),
[ChatGPT Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt),
[ChatGPT Images](https://help.openai.com/en/articles/11084440-images-in-chatgpt).
