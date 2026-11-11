import calendar
import getpass
import hashlib
import ipaddress
import os
import secrets
import sqlite3
import sys
import time
from contextlib import closing
from datetime import datetime
from html import escape
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

from core import SHANGHAI, advance_balance, cents, daily_seconds, hash_password, month_bounds, network_allowed, verify_password, within_venue

DB = Path(os.getenv("OAK_STAFF_DB", "staff.sqlite"))
ORIGIN = os.getenv("OAK_STAFF_ORIGIN", "http://localhost:3111")
HOST = urlsplit(ORIGIN).netloc
REHEARSAL = os.getenv("OAK_STAFF_ATTENDANCE_MODE") == "rehearsal"
NETWORKS = [ipaddress.ip_network(value.strip()) for value in os.getenv("OAK_STAFF_NETWORKS", "").split(",") if value.strip()]
VENUE = tuple(float(os.getenv(name, "nan")) for name in (
    "OAK_STAFF_LATITUDE", "OAK_STAFF_LONGITUDE", "OAK_STAFF_RADIUS_METRES"
))
ATTEMPTS = {}


def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    return db


def query(db, sql, *values):
    return db.execute(sql, values).fetchall()


def stamp():
    return int(time.time())


def local_time(seconds):
    return datetime.fromtimestamp(seconds, SHANGHAI).strftime("%Y-%m-%d %H:%M")


def hours(seconds):
    return f"{seconds // 3600}h {seconds % 3600 // 60:02d}m"


def money(amount):
    return f"¥{amount // 100:,}.{amount % 100:02d}"


def field(label, name, kind="text", value="", required=True):
    return f'<label>{escape(label)}<input name="{name}" type="{kind}" value="{escape(str(value), quote=True)}" {"required" if required else ""}></label>'


def options(label, name, rows, first=None):
    choices = f'<option value="">{escape(first)}</option>' if first else ""
    choices += "".join(f'<option value="{key}">{escape(str(title))}</option>' for key, title in rows)
    return f'<label>{escape(label)}<select name="{name}">{choices}</select></label>'


def form(title, action, fields, token, month=""):
    return (
        f'<form method="post" action="/{action}">'
        f'<input type="hidden" name="csrf" value="{escape(token, quote=True)}">'
        f'<input type="hidden" name="view_month" value="{escape(month, quote=True)}">'
        f'{fields}<button>{escape(title)}</button></form>'
    )


def table(columns, rows):
    header = "".join(f"<th>{escape(column)}</th>" for column in columns)
    body = "".join("<tr>" + "".join(f"<td>{escape(str(value))}</td>" for value in row) + "</tr>" for row in rows)
    return f'<div class="scroll"><table><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table></div>' if body else "<p>No records for this period.</p>"


def create_staff(db, data, role):
    username = data["username"].strip().lower()
    if not username.isascii() or not username.replace("-", "").replace("_", "").isalnum() or len(username) > 40:
        raise ValueError("Use letters, numbers, hyphens or underscores for the username.")
    name = data["name"].strip()
    if not name or len(name) > 100:
        raise ValueError("Enter a name of up to 100 characters.")
    db.execute("INSERT INTO staff(username,name,password,role,salary) VALUES(?,?,?,?,?)",
               (username, name, hash_password(data["password"]), role, cents(data["salary"])))


def staff_id(db, value):
    person = db.execute("SELECT * FROM staff WHERE id=? AND active=1", (value,)).fetchone()
    if person is None:
        raise ValueError("Choose an active staff member.")
    return person["id"]


def record(db, user, action, data, address):
    if action in ("clock-in", "clock-out"):
        if not REHEARSAL:
            if not ORIGIN.startswith("https://") or not network_allowed(address, NETWORKS):
                raise ValueError("Clocking requires the restaurant network and HTTPS.")
            try:
                position = tuple(float(data.get(key, "nan")) for key in ("latitude", "longitude", "accuracy"))
            except ValueError:
                raise ValueError("A valid location reading is required.") from None
            if not within_venue(*position, *VENUE):
                raise ValueError("Your location is outside the venue boundary or the reading is too imprecise.")
        if action == "clock-in":
            if db.execute("SELECT 1 FROM attendance WHERE staff_id=? AND ended IS NULL", (user["id"],)).fetchone():
                raise ValueError("You are already clocked in.")
            db.execute("INSERT INTO attendance(staff_id,started) VALUES(?,?)", (user["id"], stamp()))
        else:
            result = db.execute("UPDATE attendance SET ended=? WHERE staff_id=? AND ended IS NULL", (stamp(), user["id"]))
            if not result.rowcount:
                raise ValueError("You have no open shift.")
        return
    if action == "password":
        if not verify_password(data["current"], user["password"]):
            raise ValueError("Current password is incorrect.")
        db.execute("UPDATE staff SET password=? WHERE id=?", (hash_password(data["password"]), user["id"]))
        db.execute("DELETE FROM sessions WHERE staff_id=?", (user["id"],))
        return
    if user["role"] not in ("owner", "manager"):
        raise PermissionError("Payroll and staff administration require manager access.")

    if action == "review-attendance":
        person = staff_id(db, data["staff_id"])
        start, end = (int(datetime.strptime(data[key], "%Y-%m-%dT%H:%M").replace(tzinfo=SHANGHAI).timestamp())
                      for key in ("started", "ended"))
        reference = data["reference"].strip()
        if not reference or not start < end <= stamp():
            raise ValueError("Enter completed shift times and the Wi-Fi log reference.")
        if db.execute("""SELECT 1 FROM attendance WHERE staff_id=? AND started<?
                          AND (ended IS NULL OR ended>?)""", (person, end, start)).fetchone():
            raise ValueError("This interval overlaps a recorded or open shift.")
        shift = db.execute("INSERT INTO attendance(staff_id,started,ended) VALUES(?,?,?)",
                           (person, start, end))
        db.execute("INSERT INTO attendance_review VALUES(?,?,?,?)",
                   (shift.lastrowid, user["id"], stamp(), reference))
    elif action == "staff":
        role = data.get("role", "employee")
        if role != "employee" and not (role == "manager" and user["role"] == "owner"):
            raise PermissionError("Only the owner can add payroll managers.")
        create_staff(db, data, role)
    elif action == "advance":
        person = staff_id(db, data["staff_id"])
        amount = cents(data["amount"])
        if not amount or not data["note"].strip():
            raise ValueError("Enter the advance amount and payment reference.")
        db.execute("INSERT INTO advances(staff_id,amount,note,issued) VALUES(?,?,?,?)",
                   (person, amount, data["note"].strip(), stamp()))
    elif action == "repayment":
        advance = data["advance_id"]
        amount = cents(data["amount"])
        reference = data["reference"].strip()
        if not reference or not 0 < amount <= advance_balance(db, advance):
            raise ValueError("Enter a reference and a repayment within the outstanding advance.")
        db.execute("INSERT INTO advance_repayments(advance_id,amount,paid,reference) VALUES(?,?,?,?)",
                   (advance, amount, stamp(), reference))
    elif action == "payroll":
        person = staff_id(db, data["staff_id"])
        month_bounds(data["month"])
        gross = cents(data["gross"]) if data["gross"].strip() else db.execute(
            "SELECT salary FROM staff WHERE id=?", (person,)
        ).fetchone()[0]
        deduction = cents(data["deduction"])
        recovery = cents(data["recovery"])
        reason = data["reason"].strip()
        advance = data.get("advance_id", "").strip() or None
        if gross < deduction + recovery or (deduction and not reason):
            raise ValueError("Check the net amount and record the reason for any deduction.")
        if recovery:
            owned = db.execute("SELECT 1 FROM advances WHERE id=? AND staff_id=?", (advance, person)).fetchone()
            if not owned or advance_balance(db, advance) < recovery:
                raise ValueError("Choose this employee’s advance and an amount within its remaining balance.")
        else:
            advance = None
        result = db.execute(
            """INSERT INTO payroll(staff_id,month,gross,deduction,reason,advance_id,recovery)
               VALUES(?,?,?,?,?,?,?) ON CONFLICT(staff_id,month) DO UPDATE SET
               gross=excluded.gross,deduction=excluded.deduction,reason=excluded.reason,
               advance_id=excluded.advance_id,recovery=excluded.recovery WHERE payroll.paid IS NULL""",
            (person, data["month"], gross, deduction, reason, advance, recovery),
        )
        if not result.rowcount:
            raise ValueError("This payroll has already been marked paid.")
    elif action == "paid":
        payroll = db.execute("SELECT * FROM payroll WHERE id=? AND paid IS NULL", (data["id"],)).fetchone()
        if payroll is None or not data["reference"].strip():
            raise ValueError("Choose an unpaid record and enter the payment reference.")
        if payroll["recovery"] and advance_balance(db, payroll["advance_id"]) < payroll["recovery"]:
            raise ValueError("Advance balance changed. Update the payroll draft before recording payment.")
        db.execute("UPDATE payroll SET paid=?, reference=? WHERE id=?",
                   (stamp(), data["reference"].strip(), payroll["id"]))
    elif action == "rent":
        month_bounds(data["month"])
        due, paid = cents(data["due"]), cents(data["paid"])
        if not data["property"].strip() or not 0 < due or paid > due or (paid and not data["note"].strip()):
            raise ValueError("Check the rent amounts and include a reference for payments.")
        db.execute("""INSERT INTO rent(property,month,due,paid,note) VALUES(?,?,?,?,?)
                      ON CONFLICT(property,month) DO UPDATE SET
                      due=excluded.due,paid=excluded.paid,note=excluded.note""",
                   (data["property"].strip(), data["month"], due, paid, data["note"].strip()))
    elif action == "notice":
        person = staff_id(db, data["staff_id"]) if data.get("staff_id") else None
        if not data["message"].strip():
            raise ValueError("Enter the notice text.")
        db.execute("INSERT INTO notices(staff_id,message,created) VALUES(?,?,?)",
                   (person, data["message"].strip(), stamp()))
    elif action == "schedule":
        person = staff_id(db, data["staff_id"])
        start, end = (int(datetime.strptime(data[key], "%Y-%m-%dT%H:%M").replace(tzinfo=SHANGHAI).timestamp())
                      for key in ("started", "ended"))
        if end <= start:
            raise ValueError("Shift end must be after its start.")
        if db.execute("SELECT 1 FROM schedule WHERE staff_id=? AND started<? AND ended>?",
                      (person, end, start)).fetchone():
            raise ValueError("This employee already has a scheduled shift during those hours.")
        db.execute("INSERT INTO schedule(staff_id,started,ended,note) VALUES(?,?,?,?)",
                   (person, start, end, data["note"].strip()))
    else:
        raise ValueError("Unknown action.")


def dashboard(db, user, token, month):
    start, end = month_bounds(month)
    manager = user["role"] in ("owner", "manager")
    people = query(db, "SELECT id,name,salary FROM staff WHERE active=1 ORDER BY name") if manager else [user]
    people_ids = [(person["id"], person["name"]) for person in people]
    names = dict(people_ids)
    selector = options("Employee", "staff_id", people_ids)
    month_field = field("Month", "month", "month", month)
    sections = [f'<h1>Oak staff portal</h1><p>Signed in as {escape(user["name"])} · Shanghai time</p>']
    if REHEARSAL:
        sections.append("<p class='notice'>Staging rehearsal. Use test staff and payroll. Clocking uses rehearsal mode.</p>")
    sections.append(form("Sign out", "logout", "", token, month))
    sections.append('<details><summary>Change my password</summary>' +
                    form("Change password and sign out", "password", field("Current password", "current", "password") +
                         field("New password", "password", "password"), token, month) + '</details>')
    sections.append(f'<form method="get">{month_field}<button>View month</button></form>')
    open_shift = db.execute("SELECT started FROM attendance WHERE staff_id=? AND ended IS NULL", (user["id"],)).fetchone()
    sections.append("<h2>My attendance</h2>")
    sections.append(f"<p>Clocked in at {local_time(open_shift[0])}</p>" if open_shift else "<p>Clocked out</p>")
    location_fields = "" if REHEARSAL else (
        '<input type="hidden" name="latitude"><input type="hidden" name="longitude">'
        '<input type="hidden" name="accuracy"><p role="status" aria-live="polite"></p>'
    )
    sections.append(form("Clock out" if open_shift else "Clock in", "clock-out" if open_shift else "clock-in", location_fields, token, month))
    monthly_rows = []
    for person in people:
        shifts = query(db, """SELECT a.started,a.ended,r.reference FROM attendance a
                               LEFT JOIN attendance_review r ON r.attendance_id=a.id
                               WHERE a.staff_id=? AND a.started<?
                               AND (ended>? OR ended IS NULL) ORDER BY started DESC""",
                       person["id"], end, start)
        totals = daily_seconds(shifts, month)
        monthly_rows.append((person["name"], hours(sum(totals.values()))))
        sections.append(f'<details {"open" if person["id"] == user["id"] else ""}><summary>{escape(person["name"])} · {hours(sum(totals.values()))} completed</summary>')
        sections.append(table(["Clock in", "Clock out", "Source"], [
            (local_time(row["started"]), local_time(row["ended"]) if row["ended"] is not None else "Open",
             "Manager reviewed Wi-Fi evidence" if row["reference"] else "Clock punch") for row in shifts
        ]))
        sections.append(table(["Day", "Completed hours"], [(day, hours(value)) for day, value in sorted(totals.items())]))
        sections.append("</details>")
    if manager:
        sections.append(table(["Employee", "Total hours this month"], monthly_rows))
    scope = "" if manager else " AND staff_id=?"
    own = () if manager else (user["id"],)
    payrolls = query(db, "SELECT * FROM payroll WHERE month=?" + scope + " ORDER BY staff_id", month, *own)
    sections.append("<h2>Monthly salary</h2>")
    sections.append(table(["Employee", "Gross", "Advance recovered on payment", "Other deduction", "Reason", "Net", "Status"],
        [(names.get(row["staff_id"], "Former employee"), money(row["gross"]), money(row["recovery"]), money(row["deduction"]),
          row["reason"], money(row["gross"]-row["deduction"]-row["recovery"]),
          "Paid " + local_time(row["paid"]) + " · " + row["reference"] if row["paid"] else "Unpaid") for row in payrolls]))
    advances = query(db, "SELECT * FROM advances WHERE 1=1" + scope + " ORDER BY issued DESC", *own)
    sections.append("<h2>Salary advances</h2>")
    sections.append(table(["ID", "Employee", "Issued", "Amount", "Remaining today", "Reference"],
        [(row["id"], names.get(row["staff_id"], "Former employee"), local_time(row["issued"]), money(row["amount"]),
          money(advance_balance(db, row["id"])), row["note"]) for row in advances]))
    shifts = query(db, "SELECT * FROM schedule WHERE started<? AND ended>?" + scope + " ORDER BY started", end, start, *own)
    sections.append("<h2>Shift calendar</h2>")
    year, month_number = map(int, month.split("-"))
    calendar_rows = []
    for week in calendar.Calendar().monthdayscalendar(year, month_number):
        cells = []
        for day in week:
            if not day:
                cells.append("")
                continue
            date = datetime(year, month_number, day, tzinfo=SHANGHAI)
            midnight = int(date.timestamp())
            count = sum(row["started"] < midnight + 86400 and row["ended"] > midnight for row in shifts)
            cells.append(f"{day} · {count} shift{'s' if count != 1 else ''}" if count else str(day))
        calendar_rows.append(cells)
    sections.append(table(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], calendar_rows))
    sections.append(table(["Employee", "Start", "End", "Note"],
        [(names.get(row["staff_id"], "Former employee"), local_time(row["started"]), local_time(row["ended"]), row["note"]) for row in shifts]))
    notices = query(db, "SELECT * FROM notices" + ("" if manager else " WHERE staff_id IS NULL OR staff_id=?") + " ORDER BY created DESC LIMIT 50", *own)
    sections.append("<h2>Staff notices</h2>")
    sections.append(table(["Posted", "Audience", "Notice"], [(local_time(row["created"]), names.get(row["staff_id"], "Employee") if row["staff_id"] else "All staff", row["message"]) for row in notices]))
    if manager:
        count = db.execute("SELECT COUNT(*) FROM staff WHERE active=1 AND role!='owner'").fetchone()[0]
        sections.append(f"<h2>Staff administration · {count} active staff</h2>")
        sections.append(table(["Staff", "Monthly salary rate"], [(p["name"], money(p["salary"])) for p in people]))
        roles = options("Role", "role", [("employee", "Employee"), ("manager", "Payroll manager")]) if user["role"] == "owner" else ""
        sections.append(form("Add staff", "staff", field("Name", "name") + field("Username", "username") +
                             field("Initial password", "password", "password") + field("Monthly salary (CNY)", "salary", value="0") + roles, token, month))
        sections.append(form("Record advance paid", "advance", selector + field("Amount (CNY)", "amount") +
                             field("Payment reference", "note"), token, month))
        advance_choices = [(a["id"], f'{names.get(a["staff_id"], "Employee")} · #{a["id"]} · {money(advance_balance(db, a["id"]))}')
                           for a in advances if advance_balance(db, a["id"]) > 0]
        if advance_choices:
            sections.append(form("Record direct repayment", "repayment", options("Advance", "advance_id", advance_choices) +
                                 field("Amount returned (CNY)", "amount") + field("Payment reference", "reference"), token, month))
        sections.append(form("Save payroll draft", "payroll", selector + month_field + field("Gross salary override (CNY, optional)", "gross", required=False) +
                             field("Other deduction (CNY)", "deduction", value="0") + field("Deduction reason", "reason", required=False) +
                             options("Advance to recover", "advance_id", advance_choices, "None") +
                             field("Recovery this month (CNY)", "recovery", value="0"), token, month))
        unpaid = [(row["id"], names.get(row["staff_id"], "Former employee")) for row in payrolls if row["paid"] is None]
        if unpaid:
            sections.append(form("Record salary paid", "paid", options("Unpaid payroll", "id", unpaid) + field("Payment reference", "reference"), token, month))
        sections.append(form("Approve missed shift from Wi-Fi evidence", "review-attendance",
                             selector + field("Confirmed start (Shanghai)", "started", "datetime-local") +
                             field("Confirmed end (Shanghai)", "ended", "datetime-local") +
                             field("Router log reference", "reference"), token, month))
        sections.append(form("Publish notice", "notice", options("Audience", "staff_id", people_ids, "All staff") + field("Message", "message"), token, month))
        sections.append(form("Add scheduled shift", "schedule", selector + field("Start (Shanghai)", "started", "datetime-local") +
                             field("End (Shanghai)", "ended", "datetime-local") + field("Note", "note", required=False), token, month))
        rents = query(db, "SELECT * FROM rent WHERE month=? ORDER BY property", month)
        sections.append("<h2>Monthly rent</h2>")
        sections.append(table(["Property", "Due", "Paid", "Outstanding", "Reference"],
            [(row["property"], money(row["due"]), money(row["paid"]), money(row["due"]-row["paid"]), row["note"]) for row in rents]))
        sections.append(form("Save monthly rent", "rent", field("Property", "property") + month_field + field("Rent due (CNY)", "due") +
                             field("Total paid this month (CNY)", "paid", value="0") + field("Payment reference", "note", required=False), token, month))
    return "".join(sections)


class Handler(BaseHTTPRequestHandler):
    def response(self, content, status=200, cookie=None):
        page = """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Oak staff portal</title><style>
        body{font:16px system-ui;background:#f5f8f5;color:#16372a;margin:0}main{max-width:1100px;margin:auto;padding:20px}
        h2{margin-top:28px}form,details,.scroll{background:#fff;border:1px solid #ccdcd2;border-radius:9px;padding:12px;margin:10px 0}
        form{display:flex;flex-wrap:wrap;gap:12px;align-items:end}label{display:grid;gap:4px}input,select,button{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}
        button{background:#205940;color:#fff;border:0;border-radius:6px;cursor:pointer}.scroll{overflow:auto}table{border-collapse:collapse;width:100%}
        td,th{text-align:left;padding:8px;border-bottom:1px solid #e2ece6;vertical-align:top}.notice{padding:10px;background:#fff1cf}
        </style><main>""" + content + '</main><script src="/attendance.js" defer></script></html>'
        data = page.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def redirect(self, path, cookie=None):
        self.send_response(303)
        self.send_header("Location", path)
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()

    def cookie(self, value, age):
        secure = "; Secure" if ORIGIN.startswith("https://") else ""
        return f"oak_staff={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}{secure}"

    def identity(self, db):
        cookies = SimpleCookie()
        cookies.load(self.headers.get("Cookie", ""))
        token = cookies["oak_staff"].value if "oak_staff" in cookies else ""
        digest = hashlib.sha256(token.encode()).hexdigest()
        user = db.execute("""SELECT staff.* FROM sessions JOIN staff ON staff.id=sessions.staff_id
                            WHERE token=? AND expires>? AND active=1""", (digest, stamp())).fetchone()
        return token, digest, user

    def do_GET(self):
        if self.headers.get("Host") == HOST and self.path == "/attendance.js":
            data = Path(__file__).with_name("attendance.js").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if self.headers.get("Host") != HOST or urlsplit(self.path).path != "/":
            return self.response("<p>Page unavailable.</p>", 404)
        with closing(connect()) as db:
            token, _, user = self.identity(db)
            if user is None:
                return self.response("<h1>Oak staff sign in</h1>" + form("Sign in", "login", field("Username", "username") + field("Password", "password", "password"), ""))
            month = parse_qs(urlsplit(self.path).query).get("month", [datetime.now(SHANGHAI).strftime("%Y-%m")])[0]
            try:
                return self.response(dashboard(db, user, token, month))
            except ValueError as error:
                return self.response(f"<p>{escape(str(error))}</p><a href='/'>Back</a>", 400)

    def do_POST(self):
        if self.headers.get("Host") != HOST or self.headers.get("Origin") != ORIGIN:
            return self.response("<p>Request origin rejected.</p>", 403)
        action = urlsplit(self.path).path.lstrip("/")
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 8192 or self.headers.get_content_type() != "application/x-www-form-urlencoded":
                raise ValueError("Invalid form.")
            data = {key: value[0] for key, value in parse_qs(self.rfile.read(size).decode(), keep_blank_values=True, max_num_fields=24).items()}
            with closing(connect()) as db, db:
                if action == "login":
                    address = self.client_address[0]
                    now = stamp()
                    for peer in list(ATTEMPTS):
                        if ATTEMPTS[peer][0] <= now:
                            del ATTEMPTS[peer]
                    expires, count = ATTEMPTS.get(address, (now + 60, 0))
                    if count >= 10:
                        return self.response("<p>Try signing in again in one minute.</p>", 429)
                    ATTEMPTS[address] = (expires, count + 1)
                    user = db.execute("SELECT * FROM staff WHERE username=? AND active=1",
                                      (data["username"].strip().lower(),)).fetchone()
                    if user is None or not verify_password(data["password"], user["password"]):
                        return self.response("<p>Invalid sign-in.</p><a href='/'>Back</a>", 401)
                    token = secrets.token_urlsafe(32)
                    db.execute("DELETE FROM sessions WHERE expires<=?", (now,))
                    db.execute("INSERT INTO sessions VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user["id"], now + 28800))
                    db.commit()
                    return self.redirect("/", self.cookie(token, 28800))
                token, digest, user = self.identity(db)
                if user is None or not secrets.compare_digest(token.encode(), data.get("csrf", "").encode()):
                    raise PermissionError("Sign in again to continue.")
                if action == "logout":
                    db.execute("DELETE FROM sessions WHERE token=?", (digest,))
                    db.commit()
                    return self.redirect("/", self.cookie("", 0))
                month = data.get("view_month") or datetime.now(SHANGHAI).strftime("%Y-%m")
                month_bounds(month)
                db.execute("BEGIN IMMEDIATE")
                record(db, user, action, data, self.client_address[0])
                db.commit()
            return self.redirect("/?" + urlencode({"month": month}))
        except PermissionError as error:
            return self.response(f"<p>{escape(str(error))}</p><a href='/'>Back</a>", 403)
        except (KeyError, ValueError, sqlite3.IntegrityError) as error:
            message = str(error) if isinstance(error, ValueError) else "Check the form for missing or duplicate details."
            return self.response(f"<p>{escape(message)}</p><a href='/'>Back</a>", 400)

    def setup(self):
        super().setup()
        self.connection.settimeout(10)


def main():
    os.umask(0o077)
    DB.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as db, db:
        db.executescript(Path(__file__).with_name("schema.sql").read_text())
        if sys.argv[1:] == ["create-owner"]:
            if db.execute("SELECT 1 FROM staff WHERE role='owner'").fetchone():
                raise SystemExit("An owner account already exists.")
            create_staff(db, {"username": input("Owner username: "), "name": input("Name: "),
                              "password": getpass.getpass("Password (12+ characters): "), "salary": "0"}, "owner")
            print("Owner created.")
            return
    HTTPServer(("0.0.0.0", 3111), Handler).serve_forever()


if __name__ == "__main__":
    main()
