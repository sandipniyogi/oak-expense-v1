import './style.css';

const appEnv = process.env.NEXT_PUBLIC_APP_ENV || 'production';
const isStaging = appEnv === 'staging';

export const metadata = {
  title: isStaging
    ? 'The Oak Lounge Expenses — STAGING'
    : 'The Oak Lounge Expenses'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {isStaging && (
          <div
            style={{
              background: '#fff3cd',
              borderBottom: '1px solid #e0bf63',
              color: '#5f4700',
              fontWeight: 800,
              letterSpacing: '0.04em',
              padding: '10px 16px',
              textAlign: 'center'
            }}
          >
            STAGING — TEST DATA ONLY — DO NOT USE FOR PARTNER REPORTS
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
