export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/?overlay=user-guide',
      permanent: false,
    },
  };
}

export default function UserGuideRedirect() {
  return null;
}

