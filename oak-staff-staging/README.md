# Oak staff portal staging

This standalone rehearsal uses a separate SQLite volume and a loopback port on the Mac. Use test accounts and sample amounts. Owner and manager accounts can administer payroll, advances, schedules, notices and rent. Employees sign in to see their own attendance, payroll, advances, schedule and notices. Notices can target an employee or all staff.

## Run on the Mac

Extract the ZIP to Downloads. Start Docker Desktop and run these commands.

```bash
cd "$HOME/Downloads/oak-staff-staging"
docker compose build
docker compose run --rm staff python app.py create-owner
docker compose up -d
```

Open http://localhost:3111. Set your own owner password at the prompt. Run create-owner once for this staging volume. Use the owner dashboard to create an employee and use a separate browser profile to sign in as that employee.

## Rehearse the workflow

1. Add a test employee with a monthly salary rate. Sign in as that employee, clock in, clock out and check the daily and monthly totals. Clock out for unpaid breaks, then clock in again when work resumes. Completed intervals contribute to totals. Overnight intervals split across Shanghai calendar dates.
2. Record an advance and prepare the month's payroll. Leaving gross salary override blank uses the employee's configured rate. The draft shows gross, the separate deduction and reason, the proposed advance recovery and net pay. Record the bank reference once payment has actually been made. Advance recovery posts when you mark the payroll paid. Use a later payroll or direct repayment for the remaining amount. Each monthly payroll can apply a recovery to one advance.
3. Record the property's rent due and cumulative amount paid for the month. The difference shows outstanding rent.
4. Add a staff shift in Shanghai time and publish a notice. Verify the employee's calendar and notices in the employee view.

Deductions are entered manually with a reason for amounts already reviewed and approved by the business. Payroll is a recording tool. The app does not initiate money transfers or decide whether a deduction is permitted.

## Restaurant network deployment

The Mac package runs in rehearsal mode, including clocking. For a venue deployment, the attendance check can restrict clocking by the network address seen by the server. The app ignores forwarded client headers. A network check needs a route that preserves the real client address, and an HTTPS login endpoint for staff phones. Docker port forwarding or a proxy can mask the client address. Check the topology before choosing the restaurant network range. Do not treat a shared proxy address as the restaurant Wi-Fi range.

An employee taps Clock in after arriving and Clock out before leaving. A phone remaining on Wi-Fi does not create a shift or establish active work. Network loss does not automatically close a shift. The restaurant router model and staff Wi-Fi subnet are needed to verify the venue configuration.

The staging volume is separate from Oak Expenses and does not post salary or rent records into that ledger. Docker and the real restaurant network still need verification on the Mac and at the venue.

## Attendance update

Verified mode checks the browser location and the server-observed network address for each punch. Configure the HTTPS origin, approved network range and venue center with OAK_STAFF_ORIGIN, OAK_STAFF_NETWORKS, OAK_STAFF_LATITUDE, OAK_STAFF_LONGITUDE and OAK_STAFF_RADIUS_METRES. The reading must have accuracy of 50 metres or better and fit inside the configured boundary. Punch timestamps come from the server and display in Shanghai time. Browser coordinates are not tamper-proof. The default Compose file runs a Mac-only rehearsal.

To recover a missed shift, an owner or payroll manager can enter the confirmed start and end times with a router log reference under **Approve missed shift from Wi-Fi evidence**. The portal records who approved it and includes the interval in daily and monthly totals. It rejects overlapping shifts and future end times. Router logs are reviewed manually in this version. Network connection time alone does not establish work time.

For an existing installation, extract the attendance ZIP from Downloads into the Oak project and rebuild the staff service from that project root. The existing SQLite volume receives the additional attendance review table on startup.
