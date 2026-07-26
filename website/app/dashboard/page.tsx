'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The app marketplace now renders directly on the landing page.
export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, []);
  return null;
}
