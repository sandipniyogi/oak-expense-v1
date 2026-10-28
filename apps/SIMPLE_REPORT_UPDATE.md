# Simple Payment Report Update

This update simplifies the report dashboard.

The report now shows:
- Report type (All payments / WeChat / Alipay)
- Start date
- End date
- Total spend for that exact period
- Transaction count
- WeChat total + count
- Alipay total + count
- Detailed transactions
- CSV export
- Print / Save PDF

If no Start date is selected (All time), the report automatically displays the earliest matching saved transaction date. If no End date is selected, it displays the latest matching transaction date.

No database or API changes are required. Replace only:
- apps/web/app/page.js
- apps/web/app/style.css

Then run:

    docker compose up -d --build web
