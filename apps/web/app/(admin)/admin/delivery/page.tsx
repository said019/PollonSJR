import dynamic from "next/dynamic";

const DeliveryZonesPage = dynamic(() => import("@/components/admin/delivery-zones"), { ssr: false });

export default function AdminDeliveryPage() {
  return <DeliveryZonesPage />;
}
