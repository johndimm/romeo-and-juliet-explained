export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/?overlay=print',
      permanent: false,
    },
  };
}

export default function PrintRedirect() {
  return null;
}

