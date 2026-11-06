import { AuthPage } from '@/components/auth-page';

export default async function RegisterPage({ params }: PageProps<'/[locale]/register'>) {
  const { locale } = await params;
  return <AuthPage locale={locale} mode="register" />;
}
