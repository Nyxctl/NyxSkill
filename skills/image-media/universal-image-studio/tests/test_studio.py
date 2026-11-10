import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


CLI = Path(__file__).resolve().parents[1] / "scripts" / "studio.py"


class StudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def image(self, name, color, mode="RGBA", size=(3, 2)):
        path = self.root / name
        path.parent.mkdir(exist_ok=True)
        Image.new(mode, size, color).save(path)
        return path

    def run_studio(self, *args, code=0):
        run = subprocess.run([sys.executable, str(CLI), *map(str, args)],
                             capture_output=True, text=True)
        self.assertEqual(run.returncode, code, run.stderr + run.stdout)
        return json.loads(run.stdout) if run.stdout else run.stderr

    def test_inventory_refresh_and_corrupt_file(self):
        for number in range(20):
            self.image(f"{number}.png", "red")
        self.image("nested/0.png", "blue")
        (self.root / "broken.png").write_text("broken")
        result = self.run_studio("inventory", self.root)
        self.assertEqual(result["discovery"]["total_accessible"], 21)
        self.assertEqual(result["discovery"]["total_found"], 22)
        self.assertIn("unreadable", [image["status"] for image in result["images"]])
        self.image("new.png", "blue")
        self.assertEqual(self.run_studio("inventory", self.root)["discovery"]["total_found"], 23)

    def test_composite_preserves_outside_mask_and_versions(self):
        source = self.image("source.png", (10, 20, 30, 0))
        candidate = self.image("candidate.png", (110, 120, 130, 200))
        mask = self.image("mask.png", 0, "L")
        with Image.open(mask) as image:
            image.load()
            image.putpixel((0, 0), 255)
            image.putpixel((1, 0), 128)
            image.save(mask)
        before = source.read_bytes()
        result = self.run_studio("composite", source, candidate, mask, source)
        self.assertEqual(source.read_bytes(), before)
        self.assertTrue(result["qa"]["passed"])
        self.assertEqual(result["qa"]["changed_pixels"], 2)
        with Image.open(result["output"]) as image:
            self.assertEqual(image.getpixel((0, 0)), (110, 120, 130, 200))
            self.assertEqual(image.getpixel((1, 0)), (60, 70, 80, 100))
            self.assertEqual(image.getpixel((2, 0)), (10, 20, 30, 0))
        self.assertEqual(Path(result["output"]).name, "source-v2.png")

    def test_alpha_only_regression_is_detected(self):
        source = self.image("source.png", (10, 20, 30, 0))
        altered = self.image("altered.png", (10, 20, 30, 255))
        mask = self.image("mask.png", 0, "L")
        result = self.run_studio("verify", source, altered, mask, code=1)
        self.assertEqual(result["outside_mask_changed"], 6)

    def test_invalid_alignment_and_mask_leave_no_output(self):
        source = self.image("source.png", "red")
        candidate = self.image("candidate.png", "blue", size=(2, 2))
        mask = self.image("mask.png", 255, "L")
        output = self.root / "result.png"
        self.assertIn("align", self.run_studio("composite", source, candidate, mask, output, code=2))
        self.assertIn("grayscale", self.run_studio("composite", source, source, source, output, code=2))
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
