import { LeaseChangePage } from '@/components/lease-change-page';
export default async function Page({ params }: PageProps<'/[locale]/account/leases/[id]/return'>) {
  const { locale, id } = await params;
  return <LeaseChangePage locale={locale} id={id} mode="return" />;
}
