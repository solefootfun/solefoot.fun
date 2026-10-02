import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const CONTRACT = "0x81F2108A8B25943BdF26811714c78C6beF1704da";
const FINALIZED_TOPIC = "0xecf34d9fb9c52e0d26404324ab32922a826e9a039891d3a08f994e321fdad8af";
const SELECTORS = { current: "0x9cbe5efd", round: "0x8f1327c0", entry: "0x98ba676d", nextFee: "0x7f78ea63", nextDuration: "0xd30cad77" };
const word = (hex: string, index: number) => BigInt(`0x${hex.slice(2 + index * 64, 2 + (index + 1) * 64)}`);
const arg = (value: number) => BigInt(value).toString(16).padStart(64, "0");

type RpcResponse<T> = { result?: T; error?: { message?: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const body = await response.json() as RpcResponse<T>;
  if (!response.ok || body.error || body.result === undefined) {
    throw new Error(body.error?.message || `Chain read failed (${response.status})`);
  }
  return body.result;
}

async function call(data: string) {
  return rpc<string>("eth_call", [{ to: CONTRACT, data }, "latest"]);
}

async function imageFromMetadata(uri: string): Promise<string | null> {
  if (!/^ipfs:\/\/[a-zA-Z0-9]+$/.test(uri)) return null;
  try {
    const response = await fetch(`https://gateway.pinata.cloud/ipfs/${uri.slice(7)}`, {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const metadata = await response.json() as { image?: unknown };
    if (typeof metadata.image === "string" && /^ipfs:\/\/[a-zA-Z0-9]+$/.test(metadata.image)) {
      return `https://gateway.pinata.cloud/ipfs/${metadata.image.slice(7)}`;
    }
  } catch { /* The metadata URI remains available for later retries. */ }
  return null;
}

async function getEntry(roundId: number, entryId: number) {
  const data = await call(SELECTORS.entry + arg(roundId) + arg(entryId));
  // getEntry returns a dynamic tuple. The first word points to the tuple body.
  const base = Number(word(data, 0)) / 32;
  const owner = `0x${word(data, base).toString(16).padStart(40, "0")}`;
  const votes = Number(word(data, base + 2));
  const textOffset = Number(word(data, base + 3)) / 32;
  const length = Number(word(data, base + textOffset));
  const start = 2 + (base + textOffset + 1) * 64;
  const bytes = data.slice(start, start + length * 2).match(/.{2}/g) || [];
  const metadataURI = new TextDecoder().decode(Uint8Array.from(bytes, (byte) => parseInt(byte, 16)));
  const image = await imageFromMetadata(metadataURI);
  return { id: entryId, owner, votes, metadataURI, image };
}

async function getRound(id: number, includeEntries = true) {
  const data = await call(SELECTORS.round + arg(id));
  const entryCount = Number(word(data, 6));
  const entryIds = Array.from({ length: includeEntries ? Math.min(entryCount, 40) : 0 }, (_, index) => index + 1);
  const entries = await Promise.all(entryIds.map((entryId) => getEntry(id, entryId)));
  return {
    id,
    startsAt: Number(word(data, 0)),
    endsAt: Number(word(data, 1)),
    entryFee: word(data, 4).toString(),
    pool: word(data, 5).toString(),
    entryCount,
    winningEntryId: Number(word(data, 7)),
    winnerAmount: word(data, 8).toString(),
    buybackAmount: word(data, 9).toString(),
    finalized: word(data, 14) !== 0n,
    entries,
    finalizationTx: null as string | null,
  };
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const summary = params.get("summary") === "1";
    const beforeRaw = params.get("before");
    const before = beforeRaw === null ? null : Number(beforeRaw);
    if (before !== null && (!Number.isSafeInteger(before) || before < 1)) {
      return NextResponse.json({ error: "Invalid round cursor." }, { status: 400 });
    }
    const [idHex, block, nextFeeHex, nextDurationHex] = await Promise.all([
      call(SELECTORS.current),
      rpc<{ number: string; timestamp: string }>("eth_getBlockByNumber", ["latest", false]),
      call(SELECTORS.nextFee),
      call(SELECTORS.nextDuration),
    ]);
    const currentId = Number(word(idHex, 0));
    const top = before === null ? currentId : Math.min(currentId, before - 1);
    const ids = Array.from({ length: Math.min(summary ? 1 : 8, top) }, (_, index) => top - index);
    const rounds = await Promise.all(ids.map((id) => getRound(id, !summary)));

    await Promise.all(rounds.filter((round) => !summary && round.finalized && round.entryCount > 0).map(async (round) => {
      try {
        const logs = await rpc<Array<{ transactionHash: string }>>("eth_getLogs", [{
          address: CONTRACT,
          fromBlock: "0x49c8b88", // SoleFunRound deployment block 77,368,200.
          toBlock: "latest",
          topics: [FINALIZED_TOPIC, `0x${arg(round.id)}`],
        }]);
        round.finalizationTx = logs[0]?.transactionHash || null;
      } catch { /* Payout details still come directly from the contract. */ }
    }));

    const nextConfig = { entryFee: word(nextFeeHex, 0).toString(), duration: Number(word(nextDurationHex, 0)) };
    return NextResponse.json({ currentId, chainTime: Number(BigInt(block.timestamp)), nextConfig, rounds });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read rounds." }, { status: 502 });
  }
}
