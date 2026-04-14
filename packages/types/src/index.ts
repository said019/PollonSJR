// ─── Socket Events ──────────────────────────────────────────

export interface ServerToClientEvents {
  "order:new": (order: OrderSummary & { paymentMethod?: string; deliveryFee?: number }) => void;
  "order:status": (data: {
    orderId: string;
    orderNumber?: number;
    status: OrderStatusType;
    message?: string;
    estimatedMinutes?: number;
  }) => void;
  "order:paid": (data: { orderId: string; paymentId: string }) => void;
  "order:rejected": (data: {
    orderNumber: number;
    statusDetail: string;
    message: string;
  }) => void;
  "menu:updated": (data: { productId: string; active: boolean; soldOut: boolean }) => void;
  "store:status": (data: {
    isOpen: boolean;
    deliveryActive: boolean;
    acceptOrders: boolean;
    message?: string;
  }) => void;
  "loyalty:points": (data: { points: number; tier: LoyaltyTierType; pointsEarned?: number }) => void;
  "loyalty:tier_up": (data: { newTier: LoyaltyTierType; previousTier: LoyaltyTierType; message?: string }) => void;
}

export interface ClientToServerEvents {
  "admin:join": () => void;
  "customer:join": (data: { customerId: string }) => void;
}

// ─── Order Types ────────────────────────────────────────────

export type OrderStatusType =
  | "PENDING_PAYMENT"
  | "RECEIVED"
  | "PREPARING"
  | "READY"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED";

export type OrderTypeType = "DELIVERY" | "PICKUP";

export interface OrderSummary {
  id: string;
  orderNumber: number;
  status: OrderStatusType;
  type: OrderTypeType;
  total: number;
  customerName: string | null;
  customerPhone: string;
  itemCount: number;
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  address: string | null;
  subtotal: number;
  deliveryFee: number;
  notes: string | null;
  items: OrderItemDetail[];
  payment: PaymentInfo | null;
}

export interface OrderItemDetail {
  id: string;
  productName: string;
  qty: number;
  unitPrice: number;
  variant: string | null;
  notes: string | null;
}

// ─── Cart Types ─────────────────────────────────────────────

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  variant: string | null;
  notes: string;
  imageUrl: string | null;
}

export interface CreateOrderPayload {
  type: OrderTypeType;
  address?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryZoneId?: string;
  deliveryFee?: number;
  notes?: string;
  items: Array<{
    productId: string;
    qty: number;
    variant?: string;
    notes?: string;
  }>;
}

// ─── Payment Types ──────────────────────────────────────────

export type PaymentStatusType = "PENDING" | "APPROVED" | "REJECTED" | "REFUNDED";

export interface PaymentInfo {
  id: string;
  status: PaymentStatusType;
  amount: number;
  paidAt: string | null;
}

export interface CreatePaymentResponse {
  preferenceId: string;
  checkoutUrl: string;
}

// ─── Delivery Types ─────────────────────────────────────────

export interface DeliveryResult {
  available: boolean;
  fee?: number;
  feeMXN?: string;
  zoneName?: string;
  zoneId?: string;
  distanceKm: number;
  estimatedMinutes?: number;
  reason?: string;
}

export interface DeliveryZonePublic {
  id: string;
  name: string;
  minKm: number;
  maxKm: number;
  fee: number;
  color: string;
  active: boolean;
  sortOrder: number;
}

export interface StoreLocationPublic {
  lat: number;
  lng: number;
  address: string;
}

// ─── Product Types ──────────────────────────────────────────

export type CategoryType =
  | "POLLO_FRITO"
  | "COMBOS"
  | "HAMBURGUESAS"
  | "SNACKS"
  | "FLAUTAS"
  | "COMPLEMENTOS"
  | "BEBIDAS";

export interface ProductVariant {
  label: string;
  price: number;
}

export interface ProductPublic {
  id: string;
  name: string;
  description: string | null;
  category: CategoryType;
  price: number;
  imageUrl: string | null;
  soldOut: boolean;
  variants: ProductVariant[] | null;
}

export interface MenuByCategory {
  category: CategoryType;
  label: string;
  products: ProductPublic[];
}

// ─── Loyalty Types ──────────────────────────────────────────

export type LoyaltyTierType = "POLLITO" | "CRUJIENTE" | "VIP_POLLON";

export interface LoyaltyInfo {
  points: number;
  tier: LoyaltyTierType;
  nextTier: LoyaltyTierType | null;
  pointsToNextTier: number;
}

export interface LoyaltyEventItem {
  id: string;
  type: string;
  points: number;
  orderId: string | null;
  createdAt: string;
}

// ─── Store Types ────────────────────────────────────────────

export interface StoreStatus {
  isOpen: boolean;
  deliveryActive: boolean;
  acceptOrders: boolean;
  openTime: string;
  closeTime: string;
}

// ─── Auth Types ─────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  customer: {
    id: string;
    phone: string;
    name: string | null;
  };
}

export interface AdminAuthResponse {
  token: string;
  admin: {
    id: string;
    email: string;
    name: string | null;
  };
}

// ─── Dashboard Types ────────────────────────────────────────

export interface DashboardStats {
  ordersToday: number;
  salesToday: number;
  averageTicket: number;
  activeOrders: number;
  customersToday: number;
}
