// ─── Socket Events ──────────────────────────────────────────

export interface ServerToClientEvents {
  "order:new": (order: OrderSummary & { paymentMethod?: string; deliveryFee?: number }) => void;
  "order:status": (data: {
    orderId: string;
    orderNumber?: number;
    status: OrderStatusType;
    message?: string;
    cancelReason?: string;
    estimatedMinutes?: number;
  }) => void;
  "order:paid": (data: { orderId: string; paymentId: string }) => void;
  "order:rejected": (data: {
    orderNumber: number;
    statusDetail: string;
    message: string;
  }) => void;
  "order:assigned": (data: {
    orderId: string;
    orderNumber: number;
    driverId: string;
    driverName: string;
    driverPhone: string | null;
  }) => void;
  "driver:location": (data: {
    driverId: string;
    driverName?: string;
    lat: number;
    lng: number;
    heading?: number | null;
    speed?: number | null;
    orderId?: string | null;
    ts: string;
  }) => void;
  "driver:offline": (data: { driverId: string }) => void;
  "menu:updated": (data: { productId: string; active: boolean; soldOut: boolean }) => void;
  "store:status": (data: {
    isOpen: boolean;
    deliveryActive: boolean;
    acceptOrders: boolean;
    message?: string;
  }) => void;
  "loyalty:points": (data: LoyaltyProgressEvent) => void;
  "loyalty:tier_up": (data: { newTier: LoyaltyTierType; previousTier: LoyaltyTierType; message?: string }) => void;
  "loyalty:redeemed": (data: { message: string; productName: string }) => void;
}

export interface ClientToServerEvents {
  "admin:join": () => void;
  "customer:join": (data: { customerId: string }) => void;
  "driver:join": () => void;
}

// ─── Driver Types ───────────────────────────────────────────

export interface DriverPublic {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  vehicle: string | null;
  active: boolean;
  onShift: boolean;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: string | null;
  shiftStartedAt: string | null;
  createdAt: string;
  activeOrderCount?: number;
}

export interface DriverAuthResponse {
  token: string;
  driver: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    photoUrl: string | null;
  };
}

export interface DriverOrderSummary {
  id: string;
  orderNumber: number;
  status: OrderStatusType;
  total: number;
  paymentMethod: PaymentMethodType;
  cashAmount: number | null;
  deliveryAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  customerName: string | null;
  customerPhone: string;
  itemCount: number;
  notes: string | null;
  assignedAt: string | null;
  createdAt: string;
}

export interface DriverOrderDetail extends DriverOrderSummary {
  subtotal: number;
  deliveryFee: number;
  tipAmount: number;
  items: OrderItemDetail[];
}

export interface LocationPingPayload {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  orderId?: string;
}

// ─── Order Types ────────────────────────────────────────────

export type OrderStatusType =
  | "PENDING_PAYMENT"
  | "SCHEDULED"
  | "RECEIVED"
  | "PREPARING"
  | "READY"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED";

export type OrderTypeType = "DELIVERY" | "PICKUP";
export type PaymentMethodType = "CARD" | "CASH" | "TRANSFER";

export interface TransferInfo {
  clabe: string;
  bank: string;
  accountHolder: string;
  amount: number;
  concept: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: number;
  status: OrderStatusType;
  type: OrderTypeType;
  paymentMethod?: PaymentMethodType;
  total: number;
  customerName: string | null;
  customerPhone: string;
  itemCount: number;
  createdAt: string;
  transferProofUrl?: string | null;
  estimatedMinutes?: number | null;
  isScheduled?: boolean;
  scheduledFor?: string | null;
  depositAmount?: number | null;
  remainingAmount?: number | null;
}

export interface OrderDetail extends OrderSummary {
  address: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  paymentMethod?: PaymentMethodType;
  cashAmount?: number | null;
  transferInfo?: TransferInfo | null;
  transferProofUrl?: string | null;
  transferProofUploadedAt?: string | null;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  tipAmount?: number;
  appFeeAmount?: number;
  estimatedMinutes?: number | null;
  notes: string | null;
  cancelReason?: string | null;
  rating?: number | null;
  items: OrderItemDetail[];
  payment: PaymentInfo | null;
  driver?: {
    id: string;
    name: string;
    phone: string | null;
    photoUrl: string | null;
    vehicle: string | null;
    lat: number | null;
    lng: number | null;
    locationUpdatedAt: string | null;
  } | null;
}

export interface OrderItemDetail {
  id: string;
  productName: string;
  qty: number;
  unitPrice: number;
  variant: string | null;
  notes: string | null;
  modifiers?: Array<{
    name: string;
    option: string;
    price: number;
    qty: number;
  }>;
}

// ─── Cart Types ─────────────────────────────────────────────

export interface CartItemModifier {
  name: string;
  option: string;
  price: number;
  qty?: number;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  variant: string | null;
  notes: string;
  imageUrl: string | null;
  modifiers?: CartItemModifier[];
  /**
   * If present, this cart entry represents a promotional bundle.
   * `productId` is a synthetic key ("promo:<id>") and `price` is the
   * bundle price; the breakdown is in `promotion.items`.
   */
  promotion?: CartPromotionMeta;
}

export interface CartPromotionMeta {
  id: string;
  name: string;
  /** Bundle price in cents — already reflected in CartItem.price */
  price: number;
  items: Array<{
    productId: string;
    productName: string;
    qty: number;
    variant: string | null;
    emoji?: string | null;
  }>;
}

export interface CreateOrderPayload {
  type: OrderTypeType;
  paymentMethod?: PaymentMethodType;
  cashAmount?: number;
  address?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  deliveryZoneId?: string | null;
  deliveryAddress?: string | null;
  deliveryFee?: number | null;
  notes?: string;
  items: Array<{
    productId: string;
    qty: number;
    variant?: string;
    notes?: string;
  }>;
  promotions?: Array<{
    promotionId: string;
    qty: number;
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

export interface CardPaymentPayload {
  orderId: string;
  token: string;
  paymentMethodId: string;
  issuerId?: string | number;
  installments?: number;
  transactionAmount?: number;
  idempotencyKey?: string;
  payer?: {
    email?: string;
    identification?: {
      type?: string;
      number?: string;
    };
  };
}

export interface CreateCardPaymentResponse {
  orderId: string;
  paymentId?: string;
  status: PaymentStatusType;
  mpStatus?: string;
  statusDetail?: string | null;
  message: string;
  action?: "retry" | "alternate" | "bank" | "none";
}

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: number;
  paymentMethod: PaymentMethodType;
  checkoutUrl?: string;
  transferInfo?: TransferInfo;
  change?: string | null;
  message?: string;
  rewardApplied?: boolean;
  rewardMessage?: string | null;
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

export interface SavedAddressPublic {
  id: string;
  alias: string;
  address: string;
  lat: number;
  lng: number;
  isDefault: boolean;
  createdAt: string;
}

export interface CreateSavedAddressPayload {
  alias: string;
  address: string;
  lat: number;
  lng: number;
  isDefault?: boolean;
}

export interface UpdateSavedAddressPayload {
  alias?: string;
  address?: string;
  lat?: number;
  lng?: number;
  isDefault?: boolean;
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

export interface ProductModifierPublic {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  totalQuota?: number | null;
  options: { label: string; price: number }[];
}

export type ProductTag =
  | "vegetariano"
  | "vegano"
  | "picante"
  | "muy_picante"
  | "sin_gluten"
  | "sin_lactosa"
  | "favorito"
  | "nuevo"
  | "saludable"
  | "kids"
  | "para_compartir";

export interface ProductPublic {
  id: string;
  name: string;
  description: string | null;
  category: CategoryType;
  price: number;
  imageUrl: string | null;
  soldOut: boolean;
  variants: ProductVariant[] | null;
  tags?: ProductTag[];
  emoji?: string | null;
  modifiers?: ProductModifierPublic[];
}

export interface MenuByCategory {
  category: CategoryType;
  label: string;
  products: ProductPublic[];
}

export interface RecommendationsResponse {
  /** Top productos del propio cliente (vacío si no hay sesión o no hay suficiente historial) */
  personal: ProductPublic[];
  /** Top productos del negocio (últimos 30 días) */
  global: ProductPublic[];
  /** Qué fuente de datos se usó. Útil para el copy del label en UI */
  source: "personal" | "global" | "mixed" | "empty";
}

// ─── Loyalty Types ──────────────────────────────────────────

export type LoyaltyTierType = "POLLITO" | "CRUJIENTE" | "VIP_POLLON";

export interface LoyaltyRewardProduct {
  id: string;
  name: string;
  emoji: string | null;
}

export interface LoyaltyInfo {
  completedOrders: number;
  freeProductsEarned: number;
  freeProductsUsed: number;
  progress: number;
  ordersToNext: number;
  target: number;
  pendingReward: boolean;
  pendingProduct: LoyaltyRewardProduct | null;
  rewardEarnedAt: string | null;
  rewardExpiresAt: string | null;
}

export interface LoyaltyEventItem {
  id: string;
  cardId?: string;
  orderDelta: number;
  reason: string;
  createdAt: string;
}

export interface LoyaltyProgressEvent {
  completedOrders: number;
  progress: number;
  ordersToNext: number;
  target: number;
  pendingReward: boolean;
  points?: number;
  tier?: LoyaltyTierType;
  pointsEarned?: number;
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
