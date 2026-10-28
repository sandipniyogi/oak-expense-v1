'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '../social.module.css';

const links = [
  ['/social', 'Dashboard'],
  ['/social/media', 'Media'],
  ['/social/create', 'Create'],
  ['/social/calendar', 'Calendar'],
  ['/social/admin', 'Admin']
];

export default function SocialNav() {
  const pathname = usePathname();
  return (
    <div className={styles.topbar}>
      <div>
        <div className={styles.brandEyebrow}>OAK OPERATIONS</div>
        <div className={styles.brandTitle}>Social Studio</div>
      </div>
      <nav className={styles.nav}>
        {links.map(([href, label]) => {
          const active = href === '/social' ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} className={`${styles.navLink} ${active ? styles.navActive : ''}`}>{label}</Link>;
        })}
        <Link href="/inventory" className={styles.navLink}>Inventory</Link>
      </nav>
    </div>
  );
}
