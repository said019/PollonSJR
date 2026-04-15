import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    googleMapsApiKey:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      "",
    mpPublicKey:
      process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ||
      process.env.MP_PUBLIC_KEY ||
      "",
  });
}
