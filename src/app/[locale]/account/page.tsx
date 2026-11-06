import { DashboardSectionPage } from '@/components/dashboard-sections';

export default async function AccountPage({ params }: PageProps<'/[locale]/account'>) {
  const { locale } = await params;
  return <DashboardSectionPage locale={locale} section="overview" />;
}
