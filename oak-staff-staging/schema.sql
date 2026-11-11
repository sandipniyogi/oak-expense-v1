CREATE TABLE IF NOT EXISTS staff (
 id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','manager','employee')),
 salary INTEGER NOT NULL CHECK(salary >= 0), active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
 token TEXT PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id), expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance (
 id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id),
 started INTEGER NOT NULL, ended INTEGER CHECK(ended IS NULL OR ended >= started)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON attendance(staff_id) WHERE ended IS NULL;
CREATE TABLE IF NOT EXISTS advances (
 id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id),
 amount INTEGER NOT NULL CHECK(amount > 0), note TEXT NOT NULL, issued INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payroll (
 id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id), month TEXT NOT NULL,
 gross INTEGER NOT NULL CHECK(gross >= 0), deduction INTEGER NOT NULL CHECK(deduction >= 0),
 reason TEXT NOT NULL, advance_id INTEGER REFERENCES advances(id),
 recovery INTEGER NOT NULL CHECK(recovery >= 0), paid INTEGER,
 reference TEXT NOT NULL DEFAULT '', UNIQUE(staff_id,month),
 CHECK(gross >= deduction + recovery), CHECK(recovery = 0 OR advance_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS rent (
 id INTEGER PRIMARY KEY, property TEXT NOT NULL, month TEXT NOT NULL, due INTEGER NOT NULL CHECK(due > 0),
 paid INTEGER NOT NULL CHECK(paid >= 0 AND paid <= due), note TEXT NOT NULL, UNIQUE(property,month)
);
CREATE TABLE IF NOT EXISTS notices (
 id INTEGER PRIMARY KEY, staff_id INTEGER REFERENCES staff(id), message TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS schedule (
 id INTEGER PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id),
 started INTEGER NOT NULL, ended INTEGER NOT NULL CHECK(ended > started), note TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS advance_repayments (
 id INTEGER PRIMARY KEY, advance_id INTEGER NOT NULL REFERENCES advances(id),
 amount INTEGER NOT NULL CHECK(amount > 0), paid INTEGER NOT NULL, reference TEXT NOT NULL,
 UNIQUE(advance_id,reference)
);
CREATE TABLE IF NOT EXISTS attendance_review (
 attendance_id INTEGER PRIMARY KEY REFERENCES attendance(id),
 approved_by INTEGER NOT NULL REFERENCES staff(id),
 approved_at INTEGER NOT NULL,
 reference TEXT NOT NULL
);
