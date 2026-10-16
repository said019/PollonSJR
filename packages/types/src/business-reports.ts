export interface BusinessReportDay {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgTicket: number;
  deliveryOrders: number;
  pickupOrders: number;
  cancelledOrders: number;
  pendingOrders: number;
  customers: number;
  newCustomers: number;
}

export interface BusinessReports {
  period: {
    dateFrom: string;
    dateTo: string;
    previousFrom: string;
    previousTo: string;
    days: number;
    timeZone: string;
  };
  reports: BusinessReportDay[];
  summary: {
    periodRevenue: number;
    periodOrders: number;
    periodAvgTicket: number;
    revenueChange: number | null;
    ordersChange: number | null;
    subtotal: number;
    discounts: number;
    deliveryFees: number;
    tips: number;
    appFees: number;
    refunds: number;
    customers: number;
    newCustomers: number;
    returningCustomers: number;
    cancelledOrders: number;
    pendingOrders: number;
    activeOrders: number;
    deliveredOrders: number;
    deliveryOrders: number;
    pickupOrders: number;
    cancellationRate: number;
  };
  payments: Array<{ method: string; orders: number; revenue: number }>;
  statuses: Array<{ status: string; orders: number }>;
  topProducts: Array<{ id: string; name: string; units: number; grossRevenue: number }>;
  byHour: Array<{ hour: number; orders: number }>;
}
