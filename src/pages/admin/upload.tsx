import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/admin',
    permanent: false,
  },
});

const UploadRedirectPage = () => null;

export default UploadRedirectPage;
