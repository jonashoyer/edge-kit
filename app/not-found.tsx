import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div>
      <h1>404 - Not Found</h1>
      <p>The file or directory you're looking for doesn't exist.</p>
      <Link
        href="/"
      >
        Return to Root
      </Link>
    </div>
  );
} 