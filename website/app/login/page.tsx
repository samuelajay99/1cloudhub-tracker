'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Sign in / request access now live directly on the landing page.
export default function LoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, []);
  return null;
}
