import "dotenv/config";
import fs from "node:fs/promises";
import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const KEEPER_CONTRACT = "0x5956a06B5b2D93416392C04aF52c2c38864730f3";
const POLL_MS = Number(process.env.POLL_MS || 15000);

const keeperAbi = [
  "function keeper() view returns (address)",
  "function checkUpkeep(uint256 roundId) view returns (bool)",
  "function performUpkeep(uint256 roundId)",
];

if (!process.env.KEYSTORE_PATH || !process.env.KEYSTORE_PASSWORD) {
  throw new Error("KEYSTORE_PATH and KEYSTORE_PASSWORD are required");
}

const provider = new ethers.JsonRpcProvider(RPC_URL, 4663);
const encryptedJson = await fs.readFile(process.env.KEYSTORE_PATH, "utf8");
const wallet = await ethers.Wallet.fromEncryptedJson(
  encryptedJson,
  process.env.KEYSTORE_PASSWORD,
);
const signer = wallet.connect(provider);
const contract = new ethers.Contract(KEEPER_CONTRACT, keeperAbi, signer);

console.log(`[keeper] wallet: ${signer.address}`);
console.log(`[keeper] contract: ${KEEPER_CONTRACT}`);

async function tick() {
  try {
    const needed = await contract.checkUpkeep(0);
    if (!needed) {
      console.log(`[keeper] no action (${new Date().toISOString()})`);
      return;
    }

    console.log("[keeper] ended round detected; submitting finalization...");
    const tx = await contract.performUpkeep(0);
    console.log(`[keeper] tx: ${tx.hash}`);
    await tx.wait();
    console.log("[keeper] finalization confirmed");
  } catch (error) {
    console.error("[keeper] tick failed:", error.shortMessage || error.message);
  }
}

await tick();
setInterval(tick, POLL_MS);
