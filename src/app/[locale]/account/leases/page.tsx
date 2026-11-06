import { DashboardSectionPage } from '@/components/dashboard-sections';

export default async function Page({ params }: PageProps<'/[locale]/account/leases'>) {
  const { locale } = await params;
  return <DashboardSectionPage locale={locale} section="leases" />;
}
