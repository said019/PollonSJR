import { CustomerNotificationsBootstrap } from "@/components/client/customer-notifications-bootstrap";
import { BlockedBanner } from "@/components/client/blocked-banner";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CustomerNotificationsBootstrap />
      <BlockedBanner />
      {children}
    </>
  );
}
