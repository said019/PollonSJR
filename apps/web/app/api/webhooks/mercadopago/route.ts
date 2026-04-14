import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Forward webhook to backend API
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const body = await request.text();
  const headers: Record<string, string> = {};

  // Forward MP signature headers
  const sig = request.headers.get("x-signature");
  if (sig) headers["x-signature"] = sig;
  const reqId = request.headers.get("x-request-id");
  if (reqId) headers["x-request-id"] = reqId;

  const res = await fetch(`${API_URL}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
