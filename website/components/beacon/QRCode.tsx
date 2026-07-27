'use client';

import { useEffect, useRef } from 'react';
import QRCodeLib from 'qrcode';

export default function QRCode({ url, size = 200 }: { url: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, url, { width: size, margin: 1 }, () => {});
  }, [url, size]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ borderRadius: 'var(--radius-md)' }} />;
}
