import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const TARGET = '/?overlay=settings';

export default function SettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(TARGET, undefined, { shallow: true, scroll: false });
  }, [router]);

  return (
    <>
      <Head>
        <meta httpEquiv="refresh" content={`0;url=${TARGET}`} />
      </Head>
      <p>
        Redirecting to settings…{' '}
        <a href={TARGET}>click here</a> if you are not redirected automatically.
      </p>
    </>
  );
}

