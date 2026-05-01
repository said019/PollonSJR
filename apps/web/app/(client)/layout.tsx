import { CustomerNotificationsBootstrap } from "@/components/client/customer-notifications-bootstrap";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <CustomerNotificationsBootstrap />
      {children}
    </>
  );
}
