import { AuthPage } from '@/components/auth-page';

export default async function LoginPage({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  return <AuthPage locale={locale} mode="login" />;
}
