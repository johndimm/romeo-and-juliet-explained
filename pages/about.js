export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/?overlay=about',
      permanent: false,
    },
  };
}

export default function AboutRedirect() {
  return null;
}

