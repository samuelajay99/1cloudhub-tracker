'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The pending state now renders directly on the landing page.
export default function PendingRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, []);
  return null;
}
