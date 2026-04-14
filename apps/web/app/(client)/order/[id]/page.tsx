import { OrderTracker } from "@/components/client/order-tracker";

export default function OrderPage({ params }: { params: { id: string } }) {
  return <OrderTracker orderId={params.id} />;
}
