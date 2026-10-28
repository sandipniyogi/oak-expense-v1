from fastapi import FastAPI, UploadFile, File, HTTPException
from rapidocr import RapidOCR
import tempfile
import os
import re
import unicodedata
from PIL import Image, ImageOps, ImageEnhance, ImageFilter

app = FastAPI(title="Oak OCR Service")
OCR_BUILD = "transaction-ocr-v7-taobao-order"

# Uses ONNX Runtime CPU by default.
ocr = RapidOCR()

# Generic money patterns used for normal WeChat / Alipay screenshots.
# The sign is optional because expense screenshots may show outgoing payments as
# negative values. The application stores expenses as positive values.
AMOUNT_PATTERNS = [
    re.compile(r"(?:¥|￥|CNY\s*)\s*[-−–—]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.I),
    re.compile(
        r"(?:支付金额|付款金额|实付|金额)\s*[:：]?\s*[-−–—]?\s*"
        r"([0-9][0-9,]*(?:\.\d{1,2})?)"
    ),
]

DATE_PATTERNS = [
    re.compile(r"(20\d{2})[年\-/\.](\d{1,2})[月\-/\.](\d{1,2})日?"),
]

DATETIME_PATTERN = re.compile(
    r"(20\d{2})[\-/\.](\d{1,2})[\-/\.](\d{1,2})"
    r"(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?"
)

WECHAT_RECIPIENT_PATTERNS = [
    # Example: "Awaiting shan to confirm receipt"
    re.compile(r"awaiting\s+(.{1,80}?)\s+to\s+confirm\s+receipt", re.I),
]

TRANSACTION_DETAIL_MARKERS = (
    "transaction details",
    "payment time",
    "payment method",
)

# These labels occur on structured transaction-detail screenshots. They are
# kept here so merchant extraction can skip them reliably.
TRANSACTION_LABEL_PATTERNS = [
    re.compile(r"^transaction\s+details\b", re.I),
    re.compile(r"^payment\s+time\b", re.I),
    re.compile(r"^payment\s+method\b", re.I),
    re.compile(r"^item\s+description\b", re.I),
    re.compile(r"^full\s+name\s+of\s+payee\b", re.I),
    re.compile(r"^transactions?\s+category\b", re.I),
    re.compile(r"^transaction\s+successful\b", re.I),
    re.compile(r"^labels?\b", re.I),
    re.compile(r"^notes?\b", re.I),
    re.compile(r"^more\b", re.I),
]

AMOUNT_ONLY_PATTERN = re.compile(
    r"^\s*[¥￥]?\s*([-−–—]?)\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:CNY)?\s*$",
    re.I,
)




# Taobao / Chinese e-commerce order-page markers.  These pages are not
# payment-method screens: they show the merchant/store, product, list price,
# discount and the final amount actually paid.
TAOBAO_STRONG_MARKERS = (
    "实付款",
    "商品总价",
    "平台优惠",
    "订单信息",
)

TAOBAO_AUX_MARKERS = (
    "待发货",
    "待收货",
    "已发货",
    "交易成功",
    "订单保障",
    "退货宝",
    "加入购物车",
    "申请开票",
    "进店逛逛",
)

TAOBAO_STORE_SUFFIXES = (
    "专卖店",
    "旗舰店",
    "官方店",
    "企业店",
    "店铺",
    "商店",
    "超市",
    "商行",
)

TAOBAO_MONEY_RE = re.compile(
    r"[¥￥]?\s*[-−–—]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)"
)

TAOBAO_ORDER_NUMBER_RE = re.compile(r"(?<!\d)(\d{15,24})(?!\d)")


def safe_list(value):
    """Convert RapidOCR / NumPy outputs to a normal Python list safely.

    NumPy arrays cannot be used in boolean expressions such as
    ``value or []`` because a multi-element array has no single truth value.
    """
    if value is None:
        return []
    try:
        return list(value)
    except TypeError:
        return [value]

def clean_line(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalized_text(value):
    """Normalize OCR text so punctuation/spacing differences do not break parsing."""
    value = unicodedata.normalize("NFKC", clean_line(value)).lower()
    value = value.replace("−", "-").replace("–", "-").replace("—", "-")
    return re.sub(r"[^a-z0-9\u3400-\u9fff]+", " ", value).strip()


def has_stems(value, *stems):
    normalized = normalized_text(value)
    return all(stem in normalized for stem in stems)


def transaction_label_kind(value):
    if has_stems(value, "transact", "detail"):
        return "details"
    if has_stems(value, "payment", "time"):
        return "payment_time"
    if has_stems(value, "payment", "meth"):
        return "payment_method"
    if has_stems(value, "item", "desc"):
        return "item_description"
    if has_stems(value, "name", "payee"):
        return "payee"
    if has_stems(value, "transact", "categor"):
        return "category"
    if has_stems(value, "transact", "success"):
        return "success"
    return None


def transaction_layout_score(lines):
    kinds = {transaction_label_kind(line) for line in lines}
    kinds.discard(None)
    core = kinds & {"payment_time", "payment_method", "item_description", "payee", "category"}
    score = len(core)
    if "details" in kinds:
        score += 2
    if "success" in kinds:
        score += 2
    return score, kinds


def normalize_numeric_ocr(value):
    """Repair common OCR mistakes only inside strings that look numeric."""
    value = unicodedata.normalize("NFKC", clean_line(value))
    value = value.replace("−", "-").replace("–", "-").replace("—", "-")
    value = value.replace("，", ",")
    # RapidOCR can occasionally read 0 as O/o in large monetary values.
    if re.search(r"[0-9][Oo]|[Oo][0-9]", value):
        value = re.sub(r"(?<=[0-9,.-])[Oo](?=[0-9,.]|$)", "0", value)
        value = re.sub(r"(?<![A-Za-z])[Oo](?=[0-9])", "0", value)
    return value


def structured_screen_evidence(text, lines):
    """Score transaction-detail screens even when pale UI labels are missed."""
    low = normalized_text(text)
    score = 0
    reasons = []

    if "transaction successful" in low or ("transact" in low and "success" in low):
        score += 4; reasons.append("status")
    if DATETIME_PATTERN.search(text):
        score += 3; reasons.append("datetime")
    if re.search(r"\b(?:debit|credit)\s*card\b|\bcard\s*\(?\d{3,4}\)?", low, re.I):
        score += 3; reasons.append("card")
    if "payee" in low:
        score += 2; reasons.append("payee")
    if "payment method" in low or ("payment" in low and "meth" in low):
        score += 2; reasons.append("payment_method")
    if "payment time" in low:
        score += 2; reasons.append("payment_time")
    if "transaction details" in low or ("transact" in low and "detail" in low):
        score += 2; reasons.append("title")
    if "transaction category" in low or "transactions category" in low:
        score += 2; reasons.append("category")

    # A large/signed money-looking line near the top is strong evidence for
    # this payment-detail layout. This survives even if ¥ is not recognized.
    for raw in list(lines)[:24]:
        parsed = parse_amount_line(raw)
        if parsed and parsed["amount"] >= 100:
            score += 2
            reasons.append("large_amount")
            if parsed["negative"]:
                score += 2
                reasons.append("signed_amount")
            break

    # The screenshot shown by the user often still OCRs the card digits and
    # a timestamp even when the gray labels disappear.
    if re.search(r"\(\s*\d{4}\s*\)", text):
        score += 1; reasons.append("last4")

    return score, reasons


def build_enhanced_ocr_image(image_path):
    """Create a temporary high-contrast copy to recover pale gray labels."""
    image = Image.open(image_path).convert("RGB")
    # Upscale moderately: light UI labels become easier to recognize without
    # making the OCR pass excessively expensive.
    width, height = image.size
    scale = 1.5 if max(width, height) < 3200 else 1.2
    if scale != 1:
        image = image.resize((int(width * scale), int(height * scale)), Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray, cutoff=0.5)
    gray = ImageEnhance.Contrast(gray).enhance(1.55)
    gray = ImageEnhance.Sharpness(gray).enhance(1.35)
    gray = gray.filter(ImageFilter.UnsharpMask(radius=1.2, percent=130, threshold=2))

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    tmp.close()
    gray.save(tmp.name, "PNG", optimize=True)
    return tmp.name


def merge_ocr_results(primary, secondary):
    """Merge two OCR passes while preserving useful primary ordering."""
    merged_lines = []
    merged_scores = []
    seen = set()

    for result in (primary, secondary):
        if result is None:
            continue
        txts = safe_list(getattr(result, "txts", None))
        scores = safe_list(getattr(result, "scores", None))
        for index, raw in enumerate(txts):
            line = clean_line(raw)
            if not line:
                continue
            key = normalized_text(line)
            if not key or key in seen:
                continue
            seen.add(key)
            merged_lines.append(line)
            try:
                merged_scores.append(float(scores[index]))
            except Exception:
                pass

    return merged_lines, merged_scores




def box_geometry(box, coordinate_scale=1.0):
    """Return normalized geometry for a RapidOCR quadrilateral box."""
    try:
        points = [[float(point[0]) / coordinate_scale, float(point[1]) / coordinate_scale] for point in box]
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        left, right = min(xs), max(xs)
        top, bottom = min(ys), max(ys)
        return {
            "left": left,
            "right": right,
            "top": top,
            "bottom": bottom,
            "cx": (left + right) / 2,
            "cy": (top + bottom) / 2,
            "width": max(1.0, right - left),
            "height": max(1.0, bottom - top),
        }
    except Exception:
        return None


def result_entries(result, pass_name="primary", coordinate_scale=1.0):
    """Convert RapidOCR output to text + confidence + page coordinates."""
    if result is None:
        return []
    txts = safe_list(getattr(result, "txts", None))
    scores = safe_list(getattr(result, "scores", None))
    boxes = safe_list(getattr(result, "boxes", None))
    entries = []
    for index, raw in enumerate(txts):
        text = clean_line(raw)
        if not text:
            continue
        geometry = box_geometry(boxes[index], coordinate_scale) if index < len(boxes) else None
        try:
            score = float(scores[index])
        except Exception:
            score = 0.0
        entries.append({
            "text": text,
            "score": score,
            "pass": pass_name,
            "geometry": geometry,
        })
    return entries


def merge_ocr_entries(primary_result, secondary_result=None, secondary_scale=1.0):
    """Merge OCR passes, retaining coordinates for spatial parsing."""
    merged = []
    seen = set()
    for entry in result_entries(primary_result, "primary", 1.0) + result_entries(secondary_result, "enhanced", secondary_scale):
        text_key = normalized_text(entry["text"])
        geo = entry.get("geometry") or {}
        # Include approximate vertical position so repeated labels in different
        # parts of the page are not accidentally removed.
        y_bucket = round(float(geo.get("cy", -1)) / 18) if geo else -1
        key = (text_key, y_bucket)
        if not text_key or key in seen:
            continue
        seen.add(key)
        merged.append(entry)
    merged.sort(key=lambda item: (
        (item.get("geometry") or {}).get("cy", 10**9),
        (item.get("geometry") or {}).get("left", 10**9),
    ))
    return merged


def loose_money_value(value):
    """Extract money from one OCR box even when symbols/spaces are imperfect."""
    value = normalize_numeric_ocr(value)
    if not value or DATETIME_PATTERN.search(value):
        return None
    if re.fullmatch(r"\d{1,2}:\d{2}(?::\d{2})?", value):
        return None

    # Remove OCR spaces inside thousands groups: 7, 000.00 -> 7,000.00
    compact = re.sub(r"(?<=\d)[,，]\s+(?=\d{3}(?:\D|$))", ",", value)
    candidates = re.findall(r"[-]?\s*[¥￥]?\s*([0-9][0-9,，]*(?:\.\d{1,2})?)", compact)
    values = []
    for token in candidates:
        try:
            number = abs(float(token.replace(",", "").replace("，", "")))
        except Exception:
            continue
        # Ignore likely year/time/status-bar numbers unless the line clearly
        # looks monetary.
        money_hint = any(mark in compact for mark in ("¥", "￥", ".", ",", "，", "-"))
        if 2000 <= number <= 2099 and not money_hint:
            continue
        if number > 0:
            values.append(number)
    return max(values) if values else None


def spatial_merchant_candidate(text):
    text = clean_line(text)
    low = normalized_text(text)
    if not text or len(text) > 70:
        return False
    if loose_money_value(text) is not None or DATETIME_PATTERN.search(text):
        return False
    if re.fullmatch(r"\d{1,2}:\d{2}(?::\d{2})?", text):
        return False
    blocked = (
        "transaction details", "transaction successful", "payment successful",
        "payment time", "payment method", "item description", "full name of payee",
        "bill management", "this transaction made it", "open the accounting book",
        "included in statistics", "contact payee", "view transaction", "labels", "notes",
    )
    if any(value in low for value in blocked):
        return False
    return sum(ch.isalpha() for ch in text) >= 2 or bool(re.search(r"[\u3400-\u9fff]", text))


def parse_spatial_transaction_details(entries, image_width, image_height, joined_text):
    """Parse structured transaction pages using OCR geometry.

    This is intentionally layout-aware. It handles pages where pale gray labels
    are missed but the central merchant / amount / status / timestamp are read.
    """
    positioned = [entry for entry in entries if entry.get("geometry")]
    if not positioned:
        return None

    # 1) Find the visually prominent monetary line in the upper half.
    amount_candidates = []
    for entry in positioned:
        geo = entry["geometry"]
        if geo["cy"] > image_height * 0.58:
            continue
        amount = loose_money_value(entry["text"])
        if amount is None:
            continue
        text = entry["text"]
        score = geo["height"] * 5
        if any(char in text for char in ("¥", "￥")):
            score += 120
        if "," in text or "，" in text:
            score += 90
        if "." in text:
            score += 60
        if "-" in normalize_numeric_ocr(text):
            score += 100
        if amount >= 100:
            score += 60
        # The main amount on these transaction pages is normally centered.
        center_distance = abs(geo["cx"] - image_width / 2) / max(1.0, image_width)
        score += max(0, 100 - center_distance * 240)
        amount_candidates.append((score, amount, entry))

    if not amount_candidates:
        return None
    _, amount, amount_entry = max(amount_candidates, key=lambda row: row[0])
    amount_geo = amount_entry["geometry"]

    # 2) Merchant/recipient is normally the closest plausible centered text
    # immediately above the amount.
    merchant_candidates = []
    for entry in positioned:
        geo = entry["geometry"]
        dy = amount_geo["cy"] - geo["cy"]
        if dy <= 0 or dy > image_height * 0.20:
            continue
        if not spatial_merchant_candidate(entry["text"]):
            continue
        horizontal_distance = abs(geo["cx"] - amount_geo["cx"])
        if horizontal_distance > image_width * 0.30:
            continue
        score = 250 - (dy / max(1.0, image_height) * 900) - (horizontal_distance / max(1.0, image_width) * 200)
        score += min(50, geo["height"])
        if 2 <= len(entry["text"]) <= 30:
            score += 40
        merchant_candidates.append((score, entry["text"]))
    merchant = max(merchant_candidates, key=lambda row: row[0])[1] if merchant_candidates else None

    # 3) Look for the status immediately below the amount. This is strong
    # evidence that the selected number is the transaction amount.
    status = None
    status_found = False
    for entry in positioned:
        geo = entry["geometry"]
        dy = geo["cy"] - amount_geo["cy"]
        low = normalized_text(entry["text"])
        if 0 < dy < image_height * 0.12 and ("success" in low or "successful" in low):
            status = "successful"
            status_found = True
            break

    expense_date, transaction_time = parse_datetime(joined_text)
    payment_instrument = fallback_payment_instrument([entry["text"] for entry in positioned], joined_text)
    payee = fallback_payee([entry["text"] for entry in positioned])
    category = fallback_category([entry["text"] for entry in positioned])

    # Require multiple independent clues before overriding the generic parser.
    evidence = 0
    evidence += 3 if amount is not None else 0
    evidence += 3 if expense_date else 0
    evidence += 3 if status_found else 0
    evidence += 2 if payment_instrument else 0
    evidence += 2 if merchant else 0
    if evidence < 7:
        return None

    description_parts = []
    if payment_instrument:
        description_parts.append(payment_instrument)
    if payee:
        description_parts.append(f"Payee: {payee}")

    return {
        "amount": amount,
        "currency": "CNY",
        "merchant": merchant,
        "payment_method": "other",
        "expense_date": expense_date or parse_date(joined_text),
        "transaction_time": transaction_time,
        "transaction_status": status,
        "transaction_direction": "outflow",
        "payment_instrument": payment_instrument,
        "payee": payee,
        "item_description": None,
        "category_suggestion": category,
        "description": " · ".join(description_parts),
        "source_type": "transaction_details_spatial",
    }


def taobao_layout_score(text, lines):
    """Score whether OCR text looks like a Taobao-style order detail page.

    We intentionally require multiple independent order-page clues because
    generic Chinese payment screenshots may also contain the word 实付.
    """
    joined = "\n".join(clean_line(line) for line in lines if clean_line(line))
    haystack = joined or text
    score = 0
    reasons = []

    for marker in TAOBAO_STRONG_MARKERS:
        if marker in haystack:
            score += 3
            reasons.append(marker)

    for marker in TAOBAO_AUX_MARKERS:
        if marker in haystack:
            score += 1
            reasons.append(marker)

    if any(suffix in haystack for suffix in TAOBAO_STORE_SUFFIXES):
        score += 2
        reasons.append("store")

    if TAOBAO_ORDER_NUMBER_RE.search(haystack):
        score += 2
        reasons.append("order_number")

    # A final paid amount together with either original price or discount is
    # a particularly strong signature of an order-detail page.
    if "实付款" in haystack and ("商品总价" in haystack or "平台优惠" in haystack):
        score += 4
        reasons.append("pricing_block")

    return score, reasons


def taobao_money_from_text(value):
    """Return a positive CNY amount from one OCR string, if present."""
    value = normalize_numeric_ocr(value)
    if not value:
        return None
    # Quantity text such as "共1件" is not a price.
    if "件" in value and not any(symbol in value for symbol in ("¥", "￥", ".")):
        return None
    matches = TAOBAO_MONEY_RE.findall(value)
    numbers = []
    for token in matches:
        try:
            number = abs(float(token.replace(",", "")))
        except Exception:
            continue
        if number > 0:
            numbers.append(number)
    return numbers[-1] if numbers else None


def taobao_value_near_label(lines, labels, lookahead=3):
    """Read a monetary value on the same or following OCR line as a label."""
    cleaned = [clean_line(line) for line in lines]
    for index, line in enumerate(cleaned):
        if not any(label in line for label in labels):
            continue

        # Prefer a value that occurs after the label on the same OCR line.
        same_line = line
        for label in labels:
            if label in same_line:
                remainder = same_line.split(label, 1)[1]
                amount = taobao_money_from_text(remainder)
                if amount is not None:
                    return amount

        # OCR may split the label and amount into separate boxes/lines.
        for offset in range(1, lookahead + 1):
            if index + offset >= len(cleaned):
                break
            candidate = cleaned[index + offset]
            # Stop once we clearly enter another labeled pricing row.
            if offset > 1 and any(marker in candidate for marker in TAOBAO_STRONG_MARKERS):
                break
            amount = taobao_money_from_text(candidate)
            if amount is not None:
                return amount
    return None


def taobao_store_name(lines):
    """Find the store/merchant name shown above the product block."""
    candidates = []
    for index, raw in enumerate(lines):
        line = clean_line(raw)
        if not line or len(line) > 80:
            continue
        if "进店逛逛" in line:
            continue
        if any(suffix in line for suffix in TAOBAO_STORE_SUFFIXES):
            # Prefer names ending in a canonical shop suffix and appearing
            # before the pricing summary.
            score = 100 - index
            if line.endswith(TAOBAO_STORE_SUFFIXES):
                score += 30
            if "专卖店" in line or "旗舰店" in line:
                score += 25
            candidates.append((score, line))
    return max(candidates, key=lambda row: row[0])[1] if candidates else None


def taobao_product_text(lines, merchant=None):
    """Collect the principal product title/variant from the order page."""
    cleaned = [clean_line(line) for line in lines]
    start = 0
    if merchant:
        try:
            start = cleaned.index(merchant) + 1
        except ValueError:
            start = 0

    blocked = (
        "进店逛逛", "退货宝", "加入购物车", "退款", "备注", "商品总价",
        "平台优惠", "实付款", "订单信息", "订单保障", "申请开票",
        "修改地址", "客服", "投诉", "催发货", "价格明细",
        "88VIP", "好评率", "破损包退",
    )
    candidates = []
    for index in range(start, min(len(cleaned), start + 14)):
        line = cleaned[index]
        if not line or any(word in line for word in blocked):
            continue
        if re.fullmatch(r"\s*[¥￥]?\s*[-−–—]?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*", line):
            continue
        if re.fullmatch(r"[xX×]?\s*\d+", line):
            continue
        if TAOBAO_ORDER_NUMBER_RE.fullmatch(re.sub(r"\s+", "", line)):
            continue

        product_hint = (
            "【" in line or "[" in line or "ml" in line.lower() or "kg" in line.lower()
            or bool(re.search(r"[\u3400-\u9fff]{4,}", line))
        )
        if product_hint and len(line) >= 5:
            candidates.append(line)
        if len(candidates) >= 2:
            break

    # Keep the description useful but not excessively long in the form/Excel.
    text = " / ".join(candidates)
    return text[:220] if text else None


def taobao_quantity(lines, text):
    for raw in lines:
        line = clean_line(raw)
        match = re.search(r"(?:^|\s)[xX×]\s*(\d{1,3})(?:\s|$)", line)
        if match:
            return int(match.group(1))
    match = re.search(r"共\s*(\d{1,3})\s*件", text)
    return int(match.group(1)) if match else None


def taobao_order_number(text):
    # Prefer a long number occurring near 订单信息.
    lines = [clean_line(line) for line in text.splitlines() if clean_line(line)]
    for index, line in enumerate(lines):
        if "订单信息" in line:
            for candidate in [line] + lines[index + 1:index + 4]:
                match = TAOBAO_ORDER_NUMBER_RE.search(candidate)
                if match:
                    return match.group(1)
    match = TAOBAO_ORDER_NUMBER_RE.search(text)
    return match.group(1) if match else None


def taobao_status(text):
    for marker, status in (
        ("待发货", "pending_shipment"),
        ("待收货", "pending_receipt"),
        ("已发货", "shipped"),
        ("交易成功", "completed"),
        ("退款成功", "refunded"),
        ("退款中", "refund_pending"),
    ):
        if marker in text:
            return status
    return None


def taobao_category_suggestion(product_text):
    """Map obvious product keywords to categories already used by Oak."""
    value = product_text or ""
    if any(word in value for word in (
        "油污", "除油", "去油", "清洁", "清洗", "洗洁", "清洁剂",
        "厨房重油", "洁厕", "消毒", "拖把", "垃圾袋",
    )):
        return "Cleaning"
    if any(word in value for word in ("酒", "啤酒", "红酒", "白酒", "葡萄酒")):
        return "Wine & Spirits"
    if any(word in value for word in ("杯", "玻璃杯", "酒杯")):
        return "Glassware"
    if any(word in value for word in ("食品", "零食", "水果", "蔬菜", "调味", "食材")):
        return "Food & Garnish"
    return None


def parse_taobao_order(lines, joined_text):
    """Parse Taobao order-detail screenshots into Oak expense fields.

    The final amount must come from 实付款, not from 商品总价.  This is
    important because Taobao often shows a larger list price plus a discount.
    """
    merchant = taobao_store_name(lines)
    product = taobao_product_text(lines, merchant)
    actual_paid = taobao_value_near_label(lines, ("实付款", "实付"), lookahead=3)
    item_total = taobao_value_near_label(lines, ("商品总价",), lookahead=2)
    discount = taobao_value_near_label(lines, ("平台优惠", "优惠"), lookahead=2)
    quantity = taobao_quantity(lines, joined_text)
    order_number = taobao_order_number(joined_text)
    status = taobao_status(joined_text)
    category = taobao_category_suggestion(product)

    # Do NOT infer a transaction date from text such as "至10/21 23:02";
    # on Taobao that is commonly a return/price-protection deadline rather
    # than the purchase date.  Only use a full, explicitly labeled date.
    expense_date = None
    labeled_date_match = re.search(
        r"(?:下单时间|支付时间|创建时间|成交时间)\s*[:：]?\s*"
        r"(20\d{2})[年\-/\.]\s*(\d{1,2})[月\-/\.]\s*(\d{1,2})日?",
        joined_text,
    )
    if labeled_date_match:
        year, month, day = map(int, labeled_date_match.groups())
        expense_date = f"{year:04d}-{month:02d}-{day:02d}"

    description_parts = ["Taobao order"]
    if product:
        description_parts.append(f"Item: {product}")
    if item_total is not None:
        description_parts.append(f"Original: ¥{item_total:.2f}")
    if discount is not None:
        description_parts.append(f"Discount: ¥{discount:.2f}")
    if quantity is not None:
        description_parts.append(f"Qty: {quantity}")
    if order_number:
        description_parts.append(f"Order: {order_number}")

    return {
        "amount": actual_paid,
        "currency": "CNY",
        "merchant": merchant,
        "payment_method": "other",
        "expense_date": expense_date,
        "description": " · ".join(description_parts),
        "category_suggestion": category,
        "source_type": "taobao_order",
        "source_app": "taobao",
        "order_status": status,
        "order_number": order_number,
        "item_description": product,
        "quantity": quantity,
        "item_total": item_total,
        "discount_amount": discount,
        "transaction_direction": "outflow",
    }


def detect_layout(text, lines=None):
    """Identify supported screenshot layouts using labels, values and context."""
    clean_lines = [clean_line(line) for line in (lines or text.splitlines()) if clean_line(line)]
    low = normalized_text(text)

    taobao_score, _taobao_reasons = taobao_layout_score(text, clean_lines)
    if taobao_score >= 8:
        return "taobao_order"

    score, kinds = transaction_layout_score(clean_lines)
    core_count = len(kinds & {"payment_time", "payment_method", "item_description", "payee", "category"})
    evidence_score, _reasons = structured_screen_evidence(text, clean_lines)

    # Old label-based path plus a value-based path for screenshots where
    # light-gray labels are invisible to OCR.
    if (
        score >= 4
        or (core_count >= 2 and ("details" in kinds or "success" in kinds or "transact" in low))
        or core_count >= 3
        or evidence_score >= 7
        or (evidence_score >= 5 and DATETIME_PATTERN.search(text))
    ):
        return "transaction_details"

    if "weixin transfer" in low or "you ve made a transfer" in low:
        return "wechat_chat_transfer"

    if "payment successful" in low and "confirm receipt" in low:
        return "wechat_payment_success"

    return "generic"

def detect_payment_method(text):
    low = normalized_text(text)

    if "微信" in text or "wechat" in low or "weixin" in low:
        return "wechat"
    if "payment successful" in low and "confirm receipt" in low:
        return "wechat"
    if "支付宝" in text or "alipay" in low:
        return "alipay"
    if "payment" in low and "meth" in low and "transact" in low:
        return "other"
    return "unknown"

def parse_amount(text):
    values = []

    for pattern in AMOUNT_PATTERNS:
        for match in pattern.finditer(text):
            try:
                value = abs(float(match.group(1).replace(",", "")))
                values.append(value)
            except Exception:
                pass

    if not values:
        for raw_line in text.splitlines():
            parsed = parse_amount_line(raw_line)
            line = clean_line(raw_line)
            if not parsed or parsed["amount"] <= 0:
                continue
            if parsed["negative"] or "," in line or "，" in line or "." in line or "¥" in line or "￥" in line:
                values.append(parsed["amount"])

    return max(values) if values else None

def parse_date(text):
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)

        if match:
            year, month, day = map(int, match.groups())
            return f"{year:04d}-{month:02d}-{day:02d}"

    return None


def parse_datetime(text):
    match = DATETIME_PATTERN.search(text)
    if not match:
        return (None, None)

    year, month, day, hour, minute, second = match.groups()
    second = second or "00"
    return (
        f"{int(year):04d}-{int(month):02d}-{int(day):02d}",
        f"{int(hour):02d}:{int(minute):02d}:{int(second):02d}",
    )


def extract_wechat_recipient(text):
    """Extract a likely recipient from WeChat transfer confirmation text."""
    for pattern in WECHAT_RECIPIENT_PATTERNS:
        match = pattern.search(text)
        if match:
            value = clean_line(match.group(1)).strip(" -:：,.，。")
            if value and len(value) <= 80:
                return value
    return None


LABEL_REGEXES = {
    "payment_time": re.compile(r"payment\s*time", re.I),
    "payment_method": re.compile(r"payment\s*meth\w*", re.I),
    "item_description": re.compile(r"item\s*desc\w*", re.I),
    "payee": re.compile(r"(?:full\s*)?name\s*(?:of\s*)?payee", re.I),
    "category": re.compile(r"transactions?\s*categor\w*", re.I),
}


def clean_labeled_value(value):
    value = clean_line(value).strip(" :：-–—|>")
    value = re.sub(r"\s*[>›»→]+\s*$", "", value).strip()
    return value


def find_labeled_value(lines, kind, lookahead=5):
    regex = LABEL_REGEXES[kind]
    for index, raw_line in enumerate(lines):
        line = clean_line(raw_line)
        if transaction_label_kind(line) != kind and not regex.search(line):
            continue

        match = regex.search(line)
        if match:
            remainder = clean_labeled_value(line[match.end():])
            if remainder:
                return remainder

        for offset in range(1, lookahead + 1):
            if index + offset >= len(lines):
                break
            candidate = clean_labeled_value(lines[index + offset])
            if not candidate:
                continue
            if transaction_label_kind(candidate):
                break
            low = normalized_text(candidate)
            if any(phrase in low for phrase in (
                "bill management", "open the accounting book", "included in statistics",
                "contact payee", "view transaction", "please select"
            )):
                continue
            return candidate
    return None


def parse_amount_line(line):
    """Parse a line that is predominantly a monetary amount.

    Accepts examples such as -7,000.00, ¥65.00, ￥ 65, 7000.00 CNY and
    common OCR variants where the minus/currency symbol is separated.
    """
    line = normalize_numeric_ocr(line)
    # Ignore obvious dates/times/phone-like strings.
    if DATETIME_PATTERN.search(line) or re.fullmatch(r"\d{1,2}:\d{2}(?::\d{2})?", line):
        return None

    normalized = re.sub(r"(?<=\d),\s+(?=\d{3}(?:\D|$))", ",", line)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    patterns = [
        r"^[¥￥]?\s*([-]?)\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:CNY|RMB)?$",
        r"^([-]?)\s*[¥￥]\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:CNY|RMB)?$",
    ]
    match = None
    for pattern in patterns:
        match = re.fullmatch(pattern, normalized, re.I)
        if match:
            break
    if not match:
        return None
    try:
        amount = abs(float(match.group(2).replace(",", "")))
    except Exception:
        return None
    if amount <= 0:
        return None
    return {"amount": amount, "negative": bool(match.group(1))}

def parse_transaction_amount(lines):
    cleaned = [clean_line(line) for line in lines]
    status_indices = [i for i, line in enumerate(cleaned) if transaction_label_kind(line) == "success" or has_stems(line, "transaction", "success")]

    for status_index in status_indices:
        for i in range(status_index - 1, max(-1, status_index - 8), -1):
            parsed = parse_amount_line(cleaned[i])
            if parsed and parsed["amount"] > 0:
                return parsed
            if i > 0:
                parsed = parse_amount_line(cleaned[i - 1] + cleaned[i])
                if parsed and parsed["amount"] > 0:
                    return parsed

    candidates = []
    for index, line in enumerate(cleaned[:25]):
        parsed = parse_amount_line(line)
        if not parsed or parsed["amount"] <= 0:
            continue
        score = 0
        if parsed["negative"]:
            score += 60
        if "," in line or "，" in line:
            score += 35
        if "." in line:
            score += 25
        if "¥" in line or "￥" in line:
            score += 25
        if parsed["amount"] < 100 and score < 35:
            score -= 25
        candidates.append((score, parsed["amount"], -index, parsed))

    return max(candidates)[3] if candidates else None


def transaction_amount_index(lines):
    cleaned = [clean_line(line) for line in lines]
    for status_index, line in enumerate(cleaned):
        if transaction_label_kind(line) == "success" or has_stems(line, "transaction", "success"):
            for i in range(status_index - 1, max(-1, status_index - 8), -1):
                if parse_amount_line(cleaned[i]):
                    return i
    best = None
    for i, line in enumerate(cleaned[:25]):
        parsed = parse_amount_line(line)
        if not parsed:
            continue
        score = (60 if parsed["negative"] else 0) + (35 if "," in line or "，" in line else 0) + (25 if "." in line else 0)
        if best is None or score > best[0]:
            best = (score, i)
    return best[1] if best else None


def merchant_candidate_score(candidate, distance):
    candidate = clean_line(candidate)
    low = normalized_text(candidate)
    if not candidate or len(candidate) > 70:
        return None
    if transaction_label_kind(candidate) or DATETIME_PATTERN.search(candidate) or parse_amount_line(candidate):
        return None
    if re.fullmatch(r"\d{1,2}:\d{2}", candidate):
        return None
    blocked = (
        "payment successful", "transaction successful", "this transaction made it",
        "bill management", "open the accounting book", "included in statistics",
        "contact payee", "view transaction", "please select", "labels", "notes", "more"
    )
    if any(item in low for item in blocked):
        return None
    if sum(ch.isalpha() for ch in candidate) < 2:
        return None
    score = 120 - distance * 12
    if 2 <= len(candidate) <= 35:
        score += 25
    if 1 <= len(candidate.split()) <= 5:
        score += 15
    if "card" in low or "debit" in low or "credit" in low:
        score -= 40
    return score


def parse_transaction_merchant(lines):
    cleaned = [clean_line(line) for line in lines]
    amount_index = transaction_amount_index(cleaned)

    if amount_index is not None:
        candidates = []
        for i in range(amount_index - 1, max(-1, amount_index - 9), -1):
            score = merchant_candidate_score(cleaned[i], amount_index - i)
            if score is not None:
                candidates.append((score, cleaned[i]))
        if candidates:
            return max(candidates)[1]

    for status_index, line in enumerate(cleaned):
        if transaction_label_kind(line) == "success" or has_stems(line, "transaction", "success"):
            candidates = []
            for i in range(status_index - 1, max(-1, status_index - 12), -1):
                score = merchant_candidate_score(cleaned[i], status_index - i)
                if score is not None:
                    candidates.append((score, cleaned[i]))
            if candidates:
                return max(candidates)[1]
    return None


def fallback_payment_instrument(lines, text):
    # Works when OCR misses the pale "Payment method" label but reads the
    # darker card value, e.g. BOC Debit Card(4503).
    candidates = []
    for raw in lines:
        line = clean_line(raw)
        low = normalized_text(line)
        if ("card" in low and ("debit" in low or "credit" in low)) or re.search(r"\bcard\b.*\(\s*\d{3,4}\s*\)", line, re.I):
            candidates.append(line)
    return candidates[0] if candidates else None


def fallback_payee(lines):
    # M. SANTANU(个人) / similar all-caps payee values can be recovered even
    # when the "Full name of payee" label is missed.
    for raw in lines:
        line = clean_line(raw)
        if re.search(r"\([^)]*(?:个人|company|business|个人账户)[^)]*\)", line, re.I):
            if not parse_amount_line(line) and len(line) <= 80:
                return line
    return None


def fallback_category(lines):
    common = {
        "food": "Food", "transport": "Transport", "shopping": "Shopping",
        "entertainment": "Entertainment", "travel": "Travel", "hotel": "Hotel",
        "restaurant": "Food", "餐饮": "Food", "食品": "Food",
    }
    for raw in lines:
        key = normalized_text(raw)
        if key in common:
            return common[key]
    return None


def parse_transaction_details(lines, joined_text):
    amount_info = parse_transaction_amount(lines)
    payment_time_value = find_labeled_value(lines, "payment_time")
    expense_date, transaction_time = parse_datetime(payment_time_value or joined_text)

    payment_instrument = find_labeled_value(lines, "payment_method") or fallback_payment_instrument(lines, joined_text)
    item_description = find_labeled_value(lines, "item_description")
    payee = find_labeled_value(lines, "payee") or fallback_payee(lines)
    category = find_labeled_value(lines, "category") or fallback_category(lines)
    merchant = parse_transaction_merchant(lines)

    low = normalized_text(joined_text)
    status = "successful" if (("transact" in low and "success" in low) or "payment successful" in low) else None
    source_method = detect_payment_method(joined_text)
    if source_method == "unknown":
        source_method = "other"

    description_parts = []
    if payment_instrument:
        description_parts.append(payment_instrument)
    if payee:
        description_parts.append(f"Payee: {payee}")
    if item_description:
        description_parts.append(f"Item: {item_description}")

    return {
        "amount": amount_info["amount"] if amount_info else parse_amount(joined_text),
        "currency": "CNY",
        "merchant": merchant,
        "payment_method": source_method,
        "expense_date": expense_date or parse_date(joined_text),
        "transaction_time": transaction_time,
        "transaction_status": status,
        "transaction_direction": "outflow" if amount_info and amount_info["negative"] else None,
        "payment_instrument": payment_instrument,
        "payee": payee,
        "item_description": item_description,
        "category_suggestion": category,
        "description": " · ".join(description_parts),
        "source_type": "transaction_details",
    }

def guess_merchant(lines, joined_text=""):
    score, _kinds = transaction_layout_score(lines)
    if score >= 2:
        structured_merchant = parse_transaction_merchant(lines)
        if structured_merchant:
            return structured_merchant

    # On WeChat transfer-confirmation screens the recipient is usually much
    # more reliable than a generic OCR merchant guess.
    recipient = extract_wechat_recipient(joined_text)
    if recipient:
        return recipient

    # In a WeChat chat screenshot, the conversation title is often the best
    # merchant hint and appears before the transfer card.
    joined_low = joined_text.lower()
    if "weixin transfer" in joined_low or "you've made a transfer" in joined_low:
        business_terms = (
            "store", "shop", "bar", "lounge", "market", "restaurant",
            "cafe", "公司", "商店", "超市", "餐", "酒",
        )
        for raw_line in lines:
            candidate = clean_line(raw_line)
            candidate_low = candidate.lower()
            if len(candidate) >= 3 and any(term.lower() in candidate_low for term in business_terms):
                return candidate

    skip_words = (
        "支付",
        "付款",
        "金额",
        "交易",
        "时间",
        "微信",
        "支付宝",
        "成功",
        "账单",
        "收款",
        "payment successful",
        "confirm receipt",
        "weixin transfer",
        "you've made a transfer",
        "done",
        "this transaction made it",
        "bill management",
        "open the accounting book",
        "included in statistics",
        "contact payee",
        "view transaction",
        "transactions category",
        "payment method",
        "payment time",
        "item description",
        "full name of payee",
        "transaction details",
    )

    candidates = []

    for line in lines:
        line = clean_line(line)
        low = line.lower()

        if len(line) < 3:
            continue

        if any(word.lower() in low for word in skip_words):
            continue

        if re.fullmatch(r"[¥￥\d\s,.:\-/]+", line):
            continue

        # Avoid chat calculation lines such as "29*2=58 + courier 7 total 65".
        if re.search(r"\d\s*[*x×+\-=]\s*\d", line, re.I):
            continue

        score = len(line)

        if any(
            keyword.lower() in low
            for keyword in (
                "公司",
                "酒",
                "商店",
                "超市",
                "餐",
                "bar",
                "lounge",
                "store",
                "shop",
                "market",
                "restaurant",
                "cafe",
            )
        ):
            score += 20

        candidates.append((score, line))

    if not candidates:
        return None

    return max(candidates)[1]


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "rapidocr",
        "runtime": "onnxruntime",
        "build": OCR_BUILD,
    }


@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    if (
        not file.content_type
        or not file.content_type.startswith("image/")
    ):
        raise HTTPException(
            status_code=400,
            detail="Image required",
        )

    suffix = (
        os.path.splitext(file.filename or "upload.png")[1]
        or ".png"
    )

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix,
    ) as tmp:
        tmp.write(await file.read())
        image_path = tmp.name

    try:
        primary_result = ocr(image_path)
        primary_lines = [clean_line(value) for value in safe_list(getattr(primary_result, "txts", None)) if clean_line(value)]
        primary_joined = "\n".join(primary_lines)
        primary_layout = detect_layout(primary_joined, primary_lines)

        enhanced_path = None
        enhanced_result = None
        # Structured transaction screenshots often use very pale gray field
        # labels. Run a second contrast-enhanced pass whenever the first pass
        # is generic or contains transaction/payment hints but too few labels.
        evidence_score, _reasons = structured_screen_evidence(primary_joined, primary_lines)
        if primary_layout == "generic" or evidence_score >= 2:
            try:
                enhanced_path = build_enhanced_ocr_image(image_path)
                enhanced_result = ocr(enhanced_path)
            except Exception:
                enhanced_result = None

        # Preserve the original text merge for compatibility, but also keep
        # RapidOCR's bounding boxes. The coordinates are the key to reliably
        # parsing structured transaction-detail screens.
        lines, scores = merge_ocr_results(primary_result, enhanced_result)
        joined = "\n".join(lines)
        layout = detect_layout(joined, lines)

        with Image.open(image_path) as original_image:
            image_width, image_height = original_image.size

        secondary_scale = 1.0
        if enhanced_path:
            try:
                with Image.open(enhanced_path) as enhanced_image:
                    secondary_scale = enhanced_image.size[0] / max(1, image_width)
            except Exception:
                secondary_scale = 1.0

        entries = merge_ocr_entries(primary_result, enhanced_result, secondary_scale)
        spatial_parsed = parse_spatial_transaction_details(
            entries, image_width, image_height, joined
        )

        if scores:
            confidence = round(
                sum(scores) / len(scores) * 100,
                2,
            )
        else:
            confidence = 0

        if layout == "taobao_order":
            parsed = parse_taobao_order(lines, joined)
        elif layout == "transaction_details":
            parsed = parse_transaction_details(lines, joined)
            # Geometry is more reliable for the visually prominent amount and
            # merchant on this screen. Fill/repair weak text-only results.
            if spatial_parsed:
                if not parsed.get("amount"):
                    parsed["amount"] = spatial_parsed.get("amount")
                weak_merchant = normalized_text(parsed.get("merchant") or "")
                if (
                    not parsed.get("merchant")
                    or "this transaction made it" in weak_merchant
                    or "bill management" in weak_merchant
                ):
                    parsed["merchant"] = spatial_parsed.get("merchant")
                for key in (
                    "expense_date", "transaction_time", "transaction_status",
                    "payment_instrument", "payee", "category_suggestion", "description"
                ):
                    if not parsed.get(key) and spatial_parsed.get(key):
                        parsed[key] = spatial_parsed[key]
                if parsed.get("payment_method") == "unknown":
                    parsed["payment_method"] = "other"
        elif spatial_parsed:
            parsed = spatial_parsed
            layout = "transaction_details_spatial"
        else:
            parsed = {
                "amount": parse_amount(joined),
                "currency": "CNY",
                "merchant": guess_merchant(lines, joined),
                "payment_method": detect_payment_method(joined),
                "expense_date": parse_date(joined),
                "description": "",
                "category_suggestion": None,
                "source_type": layout,
            }

        debug_entries = []
        for entry in entries[:60]:
            geo = entry.get("geometry") or {}
            debug_entries.append({
                "text": entry.get("text"),
                "score": round(float(entry.get("score") or 0), 4),
                "pass": entry.get("pass"),
                "y": round(float(geo.get("cy", -1)), 1) if geo else None,
                "height": round(float(geo.get("height", -1)), 1) if geo else None,
            })

        return {
            **parsed,
            "ocr_confidence": confidence,
            "lines": lines,
            "ocr_debug": {
                "layout": layout,
                "spatial_parser_used": bool(spatial_parsed),
                "image_size": [image_width, image_height],
                "entries": debug_entries,
            },
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"OCR failed: {str(exc)}",
        )

    finally:
        try:
            if 'enhanced_path' in locals() and enhanced_path:
                os.unlink(enhanced_path)
        except OSError:
            pass
        try:
            os.unlink(image_path)
        except OSError:
            pass
