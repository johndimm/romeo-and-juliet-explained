export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/?overlay=settings',
      permanent: false,
    },
  };
}

export default function SettingsRedirect() {
  return null;
}

