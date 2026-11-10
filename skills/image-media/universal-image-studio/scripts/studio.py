"""Offline reference inventory, image inspection, mask compositing and QA."""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


def inspect(path):
    with path.open("rb") as stream:
        sha256 = hashlib.file_digest(stream, "sha256").hexdigest()
        stream.seek(0)
        with Image.open(stream) as image:
            oriented = ImageOps.exif_transpose(image)
            return dict(sha256=sha256, width=oriented.width, height=oriented.height,
                        format=image.format, mode=oriented.mode,
                        frames=getattr(image, "n_frames", 1),
                        has_alpha="A" in oriented.getbands() or "transparency" in oriented.info,
                        has_icc=bool(oriented.info.get("icc_profile")))


def inventory(root):
    if not root.is_dir():
        raise ValueError(f"Not a directory: {root}")
    Image.init()
    extensions = Image.registered_extensions()
    images, errors = [], []

    def on_error(error):
        errors.append(str(error))

    for directory, dirs, names in os.walk(root, onerror=on_error):
        base = Path(directory)
        dirs[:] = sorted(name for name in dirs if name != ".git"
                         and not (base / name).is_symlink() and not junction(base / name))
        for name in sorted(names):
            path = base / name
            if path.suffix.lower() not in extensions:
                continue
            entry = dict(filename=name, path_or_attachment_ref=path.relative_to(root).as_posix(),
                         roles=[], group="candidate", is_protected_original=True)
            try:
                if path.is_symlink():
                    raise ValueError("Linked file. Scan its actual directory explicitly.")
                entry.update(inspect(path), status="accessible")
            except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as error:
                entry.update(status="unreadable", error=str(error))
            images.append(entry)
    return dict(schema_version=2, platform="codex", project_id=root.name,
                discovery=dict(mode="all-accessible-images", scope=[str(root)],
                               total_found=len(images),
                               total_accessible=sum(row["status"] == "accessible" for row in images)),
                images=images, scan_errors=errors)


def junction(path):
    return getattr(path, "is_junction", lambda: False)()


def load_image(path, mask=False):
    with Image.open(path) as image:
        if getattr(image, "n_frames", 1) != 1:
            raise ValueError(f"Expected a single-frame image: {path}")
        oriented = ImageOps.exif_transpose(image)
        if mask and oriented.mode not in ("1", "L"):
            raise ValueError("Mask must be a grayscale image (mode 1 or L).")
        return oriented.convert("L" if mask else "RGBA")


def check_sizes(*images):
    if len({image.size for image in images}) != 1:
        raise ValueError("Source, mask and candidate must align at the same dimensions.")


def verify(source, output, mask):
    original = load_image(source)
    result = load_image(output)
    weights = load_image(mask, mask=True)
    check_sizes(original, result, weights)
    diff = ImageChops.difference(original, result)
    channels = diff.split()
    changed = channels[0]
    for channel in channels[1:]:
        changed = ImageChops.lighter(changed, channel)
    protected = weights.point([255] + [0] * 255)
    outside = ImageChops.multiply(changed, protected)
    with Image.open(output) as saved:
        image_format = saved.format
    return dict(format=image_format, size=list(result.size),
                changed_pixels=result.width * result.height - changed.histogram()[0],
                outside_mask_changed=result.width * result.height - outside.histogram()[0],
                passed=image_format == "PNG" and outside.getbbox() is None)


def write_png(image, destination):
    if destination.suffix.lower() != ".png":
        raise ValueError("Output must have a .png extension.")
    for version in range(1, sys.maxsize):
        path = destination if version == 1 else destination.with_stem(f"{destination.stem}-v{version}")
        try:
            stream = path.open("xb")
        except FileExistsError:
            continue
        try:
            with stream:
                image.save(stream, format="PNG")
        except BaseException:
            path.unlink()
            raise
        return path
    raise RuntimeError("No output version available.")


def composite(source, candidate, mask, destination):
    original = load_image(source)
    patch = load_image(candidate)
    weights = load_image(mask, mask=True)
    check_sizes(original, patch, weights)
    if original.info.get("icc_profile") != patch.info.get("icc_profile"):
        raise ValueError("Source and candidate ICC profiles differ. Align color spaces first.")
    if weights.getbbox() is None:
        raise ValueError("Mask contains no editable pixels.")
    result = Image.composite(patch, original, weights)
    if original.info.get("icc_profile"):
        result.info["icc_profile"] = original.info["icc_profile"]
    path = write_png(result, destination)
    return dict(output=str(path), source_sha256=inspect(source)["sha256"],
                preservation="hard-outside-mask", qa=verify(source, path, mask))


def preview(source, destination, right_percent):
    if not 0 <= right_percent <= 100:
        raise ValueError("Right-side UI coverage must be from 0 to 100 percent.")
    original = load_image(source)
    overlay = Image.new("RGBA", original.size)
    start = round(original.width * (100 - right_percent) / 100)
    overlay.paste((16, 26, 42, 110), (start, 0, original.width, original.height))
    result = Image.alpha_composite(original, overlay)
    result.info.update(original.info)
    return dict(output=str(write_png(result, destination)), right_percent=right_percent)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name, arguments in {
        "inventory": ["root"], "inspect": ["path"],
        "composite": ["source", "candidate", "mask", "destination"],
        "verify": ["source", "output", "mask"],
    }.items():
        command = commands.add_parser(name)
        for argument in arguments:
            command.add_argument(argument, type=Path)
    preview_parser = commands.add_parser("preview")
    preview_parser.add_argument("source", type=Path)
    preview_parser.add_argument("destination", type=Path)
    preview_parser.add_argument("right_percent", type=int)
    args = vars(parser.parse_args())
    operation = args.pop("command")
    actions = dict(inventory=inventory, inspect=inspect, composite=composite, verify=verify, preview=preview)
    try:
        report = actions[operation](**args)
    except (ValueError, OSError, SyntaxError, Image.DecompressionBombError) as error:
        parser.exit(2, f"{error}\n")
    print(json.dumps(report, indent=2))
    return 0 if report.get("qa", report).get("passed", True) else 1


if __name__ == "__main__":
    sys.exit(main())
