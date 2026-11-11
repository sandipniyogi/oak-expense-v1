import hashlib
import hmac
import ipaddress
import re
import secrets
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

SHANGHAI = ZoneInfo("Asia/Shanghai")


def cents(text):
    if not re.fullmatch(r"[0-9]{1,8}(?:\.[0-9]{1,2})?", text):
        raise ValueError("Enter a CNY amount with up to two decimal places.")
    return int(Decimal(text) * 100)


def month_bounds(month):
    if not re.fullmatch(r"20[0-9]{2}-(?:0[1-9]|1[0-2])", month):
        raise ValueError("Choose a valid month.")
    year, number = map(int, month.split("-"))
    start = datetime(year, number, 1, tzinfo=SHANGHAI)
    end = datetime(year + (number == 12), number % 12 + 1, 1, tzinfo=SHANGHAI)
    return int(start.timestamp()), int(end.timestamp())


def daily_seconds(shifts, month):
    start, end = month_bounds(month)
    totals = {}
    for shift in shifts:
        if shift["ended"] is None:
            continue
        cursor = max(start, shift["started"])
        stop = min(end, shift["ended"])
        while cursor < stop:
            date = datetime.fromtimestamp(cursor, SHANGHAI).date()
            next_day = date.fromordinal(date.toordinal() + 1)
            midnight = int(datetime.combine(next_day, datetime.min.time(), SHANGHAI).timestamp())
            boundary = min(midnight, stop)
            totals[str(date)] = totals.get(str(date), 0) + boundary - cursor
            cursor = boundary
    return totals


def hash_password(password):
    if not 12 <= len(password) <= 128:
        raise ValueError("Use a password with 12 to 128 characters.")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return salt.hex() + ":" + digest.hex()


def verify_password(password, stored):
    if not 12 <= len(password) <= 128:
        return False
    salt, digest = stored.split(":")
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1)
    return hmac.compare_digest(actual.hex(), digest)


def network_allowed(address, networks):
    peer = ipaddress.ip_address(address)
    return any(peer in network for network in networks)


def advance_balance(db, advance_id):
    row = db.execute(
        """SELECT a.amount - COALESCE(SUM(p.recovery), 0) -
                  COALESCE((SELECT SUM(r.amount) FROM advance_repayments r WHERE r.advance_id=a.id), 0)
           FROM advances a LEFT JOIN payroll p ON p.advance_id = a.id AND p.paid IS NOT NULL
           WHERE a.id = ? GROUP BY a.id""", (advance_id,)
    ).fetchone()
    if row is None:
        raise ValueError("Advance was not found.")
    return row[0]


def within_venue(latitude, longitude, accuracy, venue_latitude, venue_longitude, radius):
    import math

    values = (latitude, longitude, accuracy, venue_latitude, venue_longitude, radius)
    if not all(math.isfinite(value) for value in values):
        return False
    if max(abs(latitude), abs(venue_latitude)) > 90 or max(abs(longitude), abs(venue_longitude)) > 180:
        return False
    if not 0 < accuracy <= 50 or radius <= 0:
        return False
    latitude_delta = math.radians(latitude - venue_latitude)
    longitude_delta = math.radians(longitude - venue_longitude)
    h = (math.sin(latitude_delta / 2) ** 2
         + math.cos(math.radians(latitude)) * math.cos(math.radians(venue_latitude))
         * math.sin(longitude_delta / 2) ** 2)
    distance = 12_742_000 * math.asin(math.sqrt(min(1, h)))
    return distance + accuracy <= radius
