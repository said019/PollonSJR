import { z } from "zod";

export const addressCandidateSchema = z.object({
  address: z.string().min(1).max(500), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
});
export type AddressCandidate = z.infer<typeof addressCandidateSchema>;
export type Geocoder = (address: string) => Promise<AddressCandidate[]>;

// Deliberately excludes city/postcode/street centroids and partial matches.
// Even a precise match is a proposal: the customer must confirm it.
export function parseGeocodingResponse(raw: unknown): AddressCandidate[] {
  const response = z.object({ status: z.literal("OK"), results: z.array(z.object({
    formatted_address: z.string(), partial_match: z.boolean().optional(),
    address_components: z.array(z.object({ short_name: z.string(), types: z.array(z.string()) })),
    geometry: z.object({ location_type: z.string(), location: z.object({ lat: z.number(), lng: z.number() }) }),
  })) }).safeParse(raw);
  if (!response.success) return [];
  const found: AddressCandidate[] = [];
  for (const r of response.data.results) {
    const has = (type: string) => r.address_components.some(c => c.types.includes(type));
    if (r.partial_match || !["ROOFTOP", "RANGE_INTERPOLATED"].includes(r.geometry.location_type) || !has("street_number") || !has("route") ||
        !r.address_components.some(c => c.types.includes("country") && c.short_name === "MX")) continue;
    const parsed = addressCandidateSchema.safeParse({ address: r.formatted_address, ...r.geometry.location });
    if (parsed.success && !found.some(p => p.address === parsed.data.address)) found.push(parsed.data);
  }
  return found.slice(0, 3);
}

export const geocodeAddress: Geocoder = async address => {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key || address.length < 8 || address.length > 500) return [];
  const query = new URLSearchParams({ address, key, language: "es", region: "mx", components: "country:MX" });
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${query}`, { signal: AbortSignal.timeout(8000) });
    return res.ok ? parseGeocodingResponse(await res.json()) : [];
  } catch { return []; }
};
