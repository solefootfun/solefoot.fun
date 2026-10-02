import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const errorText = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value);
async function pinataFetch(url: string, init: RequestInit, stage: string) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    } catch (error) {
      if (attempt === 2) {
        const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
        const detail = cause instanceof Error ? `${cause.message}${"code" in cause ? ` (${String(cause.code)})` : ""}` : error instanceof Error ? error.message : "network error";
        throw new Error(`${stage} failed: ${detail}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  throw new Error(`${stage} failed`);
}
async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { error: text.slice(0, 500) }; }
}

export async function POST(request: Request) {
  try {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) return NextResponse.json({ error: "PINATA_JWT is not configured." }, { status: 500 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "A camera image is required." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image is too large. Maximum size is 8 MB." }, { status: 413 });
    }

  const fileForm = new FormData();
  fileForm.append("file", file, file.name || "sole.jpg");
  fileForm.append("pinataMetadata", JSON.stringify({ name: `solefoot-${Date.now()}.jpg` }));
  fileForm.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const imageResponse = await pinataFetch(PINATA_FILE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: fileForm,
  }, "Image upload to Pinata");
  const imageResult = await readJson(imageResponse) as { IpfsHash?: string; error?: unknown; message?: unknown; details?: unknown };
  if (!imageResponse.ok || !imageResult.IpfsHash) {
    return NextResponse.json({ error: errorText(imageResult.error || imageResult.message || imageResult.details || "Image upload failed.") }, { status: 502 });
  }

  const metadata = {
    name: "solefoot Foot Entry",
    description: "A camera-captured foot entry submitted to a solefoot round.",
    image: `ipfs://${imageResult.IpfsHash}`,
  };
  const metadataResponse = await pinataFetch(PINATA_JSON_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pinataOptions: { cidVersion: 1 }, pinataMetadata: { name: `solefoot-${Date.now()}.json` }, pinataContent: metadata }),
  }, "Metadata upload to Pinata");
  const metadataResult = await readJson(metadataResponse) as { IpfsHash?: string; error?: unknown; message?: unknown; details?: unknown };
  if (!metadataResponse.ok || !metadataResult.IpfsHash) {
    return NextResponse.json({ error: errorText(metadataResult.error || metadataResult.message || metadataResult.details || "Metadata upload failed.") }, { status: 502 });
  }

    return NextResponse.json({ uri: `ipfs://${metadataResult.IpfsHash}`, imageUri: `ipfs://${imageResult.IpfsHash}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload service failed." }, { status: 500 });
  }
}
