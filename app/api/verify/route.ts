// app/api/verify/route.ts
import { verifyFaithfulness } from "@/lib/verify";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const original: string = (body.original ?? "").trim();
    const simplified: string = (body.simplified ?? "").trim();

    if (!original || !simplified) {
      return Response.json({ ok: false, error: "Missing text." }, { status: 400 });
    }

    const flags = await verifyFaithfulness(original, simplified);
    return Response.json({ ok: true, flags });
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
}