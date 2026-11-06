import { DashboardSectionPage } from '@/components/dashboard-sections';

export default async function Page({ params }: PageProps<'/[locale]/account/requests'>) {
  const { locale } = await params;
  return <DashboardSectionPage locale={locale} section="requests" />;
}
