import { CustomerNotificationsBootstrap } from "@/components/client/customer-notifications-bootstrap";
import { BlockedBanner } from "@/components/client/blocked-banner";
import { StoreStatusBanner } from "@/components/client/store-status-banner";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CustomerNotificationsBootstrap />
      <BlockedBanner />
      {/* Aviso de "cerrado" visible en TODA el área de cliente — antes solo
          aparecía dentro de /menu, así que en el landing nadie sabía si la
          tienda estaba cerrada hasta empezar a armar el pedido (hallazgo C4). */}
      <StoreStatusBanner />
      {children}
    </>
  );
}
