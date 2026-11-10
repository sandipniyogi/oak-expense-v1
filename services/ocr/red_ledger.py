"""Read marked rows from a cropped date / amount / description table."""

import re
import unicodedata

import numpy as np
from PIL import Image, ImageOps

AMOUNT = re.compile(r"([+-]?)(?:[¥￥]\s*)?((?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?)")
DATE = re.compile(
    r"(?:\d{1,2}(?:ST|ND|RD|TH)?\s*[A-Z]{3,9}(?:\s+\d{2,4})?"
    r"|[A-Z]{3,9}\s*\d{1,2}(?:,?\s+\d{2,4})?"
    r"|\d{1,4}[-/.年]\d{1,2}(?:[-/.月]\d{1,4}日?)?)", re.I,
)
DASHES = str.maketrans("−–—﹣", "----")
MAX_ROWS = 50
STRIP_HEIGHT = 64
STRIP_WIDTH = 240


def line_centres(mask):
    edges = np.flatnonzero(np.diff(np.r_[False, mask, False]))
    return [(int(start) + int(end) - 1) // 2 for start, end in zip(edges[::2], edges[1::2])]


def marked_rows(image):
    """Return marked grid bands and the first two column dividers."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    dark = rgb.max(axis=2) < 165
    height, width = dark.shape
    horizontal = line_centres(dark.mean(axis=1) > 0.65)
    if len(horizontal) < 2:
        raise ValueError("Crop the screenshot to the table and include its row and column lines.")
    vertical = line_centres(dark[horizontal[0]:horizontal[-1]].mean(axis=0) > 0.55)
    dividers = [x for x in vertical if width * 0.02 < x < width * 0.98]
    if len(dividers) < 2:
        raise ValueError("Include the dividers between date, amount, and description in the screenshot.")
    r, g, b = rgb.transpose(2, 0, 1)
    red = (r >= 150) & (r - np.maximum(g, b) >= 100) & (np.abs(g - b) <= 45)
    borders = [0, *[y for y in horizontal if 2 <= y <= height - 3], height]
    bands = []
    for number, (top, bottom) in enumerate(zip(borders, borders[1:]), start=1):
        if bottom - top < 8:
            continue
        marked = red[top + 1:bottom - 1]
        pixels = int(marked.sum())
        if max(8, (bottom - top) * width // 1500) <= pixels <= marked.size / 3:
            bands.append((number, top + 1, bottom - 1))
    if len(bands) > MAX_ROWS:
        raise ValueError("Use a screenshot with at most 50 red rows.")
    return bands, dividers[:2]


def strip_cell(image, box, width):
    cell = ImageOps.grayscale(image.crop(box))
    ink = cell.point(lambda pixel: 255 if pixel < 215 else 0).getbbox()
    if ink is None:
        return None
    cell = cell.crop(ink)
    cell.thumbnail((width - 20, STRIP_HEIGHT - 16), Image.Resampling.LANCZOS)
    if cell.height < 28:
        scale = min(3, 30 / cell.height, (width - 20) / cell.width)
        cell = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.BICUBIC)
    return cell


def signed_cents(text):
    clean = unicodedata.normalize("NFKC", text).translate(DASHES).replace(" ", "")
    if clean.startswith("(") and clean.endswith(")"):
        clean = "-" + clean[1:-1]
    match = AMOUNT.fullmatch(clean)
    if not match:
        return None
    sign, digits = match.groups()
    whole, _, fraction = digits.replace(",", "").partition(".")
    if len(whole) > 10:
        return None
    cents = int(whole) * 100 + int(fraction.ljust(2, "0"))
    if cents > 999999999999:
        return None
    return -cents if sign == "-" else cents


def read_red_ledger(image, recognize):
    bands, (date_end, amount_end) = marked_rows(image)
    rows = []
    credits = 0
    for start in range(0, len(bands), 16):
        batch = bands[start:start + 16]
        detected = [[[], []] for _ in batch]
        columns = ((2, date_end - 2), (date_end + 2, amount_end - 2))
        for column, (left, right) in enumerate(columns):
            strip = Image.new("L", (STRIP_WIDTH, len(batch) * STRIP_HEIGHT), 255)
            for index, (_, top, bottom) in enumerate(batch):
                cell = strip_cell(image, (left, top, right, bottom), STRIP_WIDTH)
                if cell is not None:
                    strip.paste(cell, (10, index * STRIP_HEIGHT + (STRIP_HEIGHT - cell.height) // 2))

            for entry in recognize(np.asarray(strip.convert("RGB"))):
                geo = entry.get("geometry")
                if geo:
                    index = int(geo["cy"] // STRIP_HEIGHT)
                    if 0 <= index < len(batch):
                        detected[index][column].append(entry)
        for (number, _, _), (dates, amounts) in zip(batch, detected):
            date = " ".join(e["text"] for e in sorted(dates, key=lambda e: e["geometry"]["left"])).strip()
            raw = "".join(e["text"] for e in sorted(amounts, key=lambda e: e["geometry"]["left"]))
            cents = signed_cents(raw)
            confident = bool(amounts) and all(e["score"] >= 0.78 for e in amounts)
            valid_date = bool(DATE.fullmatch(date))
            if valid_date and confident and cents is not None and (cents == 0 or unicodedata.normalize("NFKC", raw).strip().startswith("+")):
                credits += 1
                continue
            amount = None
            if valid_date and confident and cents is not None and cents < 0:
                amount = f"{-cents // 100}.{(-cents) % 100:02d}"
            rows.append({"number": number, "date": date, "amount": amount, "read_amount": raw})
    return {"red_ledger_rows": rows, "red_ledger_excluded": credits}
