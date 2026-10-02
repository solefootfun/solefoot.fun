"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { ArrowDown, ArrowUpRight, BookOpen, Camera, Check, Clock3, ExternalLink, Footprints, Heart, ShieldCheck, Trophy, Wallet } from "lucide-react";

type Provider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
declare global { interface Window { ethereum?: Provider } }

const CONTRACT = "0x81F2108A8B25943BdF26811714c78C6beF1704da";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const KEEPER_CONTRACT = "0x5956a06B5b2D93416392C04aF52c2c38864730f3";
const TREASURY = "0x0d31ddB91b7073fb785e146e049b7F71F8D305Fc";
const CHAIN_ID = "0x1237";
const RH = { chainId: CHAIN_ID, chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] };
const S = { current: "0x9cbe5efd", round: "0x8f1327c0", approve: "0x095ea7b3", start: "0x55e3f086", submit: "0x2b00cd64", vote: "0x0121b93f", finalize: "0x3469f6e2" };
const pad = (v: string) => v.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const u = (v: bigint | number) => BigInt(v).toString(16).padStart(64, "0");
const word = (hex: string, i: number) => BigInt(`0x${hex.replace(/^0x/, "").slice(i * 64, i * 64 + 64)}`);
const countdown = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
type RoundEntry = { id: number; owner: string; votes: number; metadataURI: string; image: string | null };
type ChainRound = { id: number; startsAt: number; endsAt: number; entryFee: string; pool: string; entryCount: number; winningEntryId: number; winnerAmount: string; buybackAmount: string; finalized: boolean; entries: RoundEntry[]; finalizationTx: string | null };
type NextConfig = { entryFee: string; duration: number };
type RoundsResponse = { currentId: number; chainTime: number; nextConfig: NextConfig; rounds: ChainRound[]; error?: string };
const usdg = (value: string) => (Number(value) / 1e6).toFixed(4);
const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const durationLabel = (seconds: number) => { const hours = seconds >= 3600; const amount = Number((seconds / (hours ? 3600 : 60)).toFixed(2)); return `${amount} ${hours ? amount === 1 ? "hour" : "hours" : amount === 1 ? "minute" : "minutes"}`; };

async function req(method: string, params: unknown[] = []) { if (!window.ethereum) throw new Error("No wallet detected."); return window.ethereum.request({ method, params }); }
async function receipt(hash: string) { for (let i = 0; i < 60; i += 1) { const result = await req("eth_getTransactionReceipt", [hash]); if (result) return result as { status?: string }; await new Promise((r) => setTimeout(r, 2000)); } throw new Error("Transaction confirmation timed out."); }
async function send(from: string, to: string, data: string) { const hash = await req("eth_sendTransaction", [{ from, to, data }]) as string; const r = await receipt(hash); if (r.status && r.status !== "0x1") throw new Error("Transaction reverted."); return hash; }
async function call(to: string, data: string) {
  const response = await fetch(RH.rpcUrls[0], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_call", params: [{ to, data }, "latest"] }) });
  const result = await response.json() as { result?: string; error?: { message?: string } };
  if (result.error || !result.result) throw new Error(result.error?.message || "RPC read failed.");
  return result.result;
}
async function latestBlockTimestamp() {
  const response = await fetch(RH.rpcUrls[0], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_getBlockByNumber", params: ["latest", false] }) });
  const result = await response.json() as { result?: { timestamp?: string }; error?: { message?: string } };
  if (result.error || !result.result?.timestamp) throw new Error(result.error?.message || "Could not read chain time.");
  return Number(BigInt(result.result.timestamp));
}

export default function Home() {
  const [view, setView] = useState<"home" | "round" | "docs">("home"); const [wallet, setWallet] = useState<string | null>(null); const [ready, setReady] = useState(false); const [walletMenu, setWalletMenu] = useState(false); const [notice, setNotice] = useState("");
  const roundTab = view === "round";
  useEffect(() => { const sync = () => { const hash = window.location.hash; if (hash.startsWith("#docs")) setView("docs"); else if (hash === "#round") setView("round"); else if (!hash) setView("home"); }; sync(); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  function navigate(next: "home" | "round" | "docs") { setNotice(""); setView(next); window.history.replaceState(null, "", next === "home" ? window.location.pathname : `#${next}`); window.scrollTo({ top: 0, behavior: "instant" }); }
  async function connect() { try { const accounts = await req("eth_requestAccounts") as string[]; const chain = await req("eth_chainId") as string; if (chain.toLowerCase() !== CHAIN_ID) await req("wallet_switchEthereumChain", [{ chainId: CHAIN_ID }]); setWallet(accounts[0] ?? null); setReady(true); setWalletMenu(false); setNotice("Wallet connected to Robinhood Chain."); } catch (e) { setNotice(e instanceof Error ? e.message : "Wallet connection failed."); } }
  async function changeWallet() { try { await req("wallet_requestPermissions", [{ eth_accounts: {} }]); } catch { /* Some wallets do not expose account permissions. */ } await connect(); }
  function disconnect() { setWallet(null); setReady(false); setWalletMenu(false); setNotice("Wallet disconnected from the app."); }
  return <div className="min-h-screen bg-[#141513] text-[#f3f0e7]">
    <header className="relative z-20 border-b border-white/10">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <button onClick={() => navigate("home")} aria-label="solefoot home" className="flex items-center gap-2 text-2xl font-black tracking-[-.07em] sm:text-3xl"><Footprints size={25} className="text-[#ff653f]" />solefoot<span className="text-[#ff653f]">.</span></button>
        <div className="flex items-center gap-3 sm:gap-8">
          <div className="flex gap-1 font-mono text-[10px] font-bold sm:gap-5 sm:text-xs">
            <button aria-pressed={view === "home"} onClick={() => navigate("home")} className={`hidden rounded-full px-3 py-2 transition-colors sm:block ${view === "home" ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`}>HOME</button>
            <button aria-pressed={roundTab} onClick={() => navigate("round")} className={`rounded-full px-2 py-2 transition-colors sm:px-3 ${roundTab ? "bg-[#ff653f] text-black" : "text-white/50 hover:text-white"}`}><span className="sm:hidden">ROUND</span><span className="hidden sm:inline">THE ROUND</span></button>
            <button aria-pressed={view === "docs"} onClick={() => navigate("docs")} className={`rounded-full px-2 py-2 transition-colors sm:px-3 ${view === "docs" ? "bg-[#e5ecda] text-black" : "text-white/50 hover:text-white"}`}>DOCS</button>
          </div>
          <div className="relative">{wallet ? <><button aria-expanded={walletMenu} onClick={() => setWalletMenu((value) => !value)} className="flex items-center gap-2 rounded-full bg-[#e9eddf] px-4 py-3 font-mono text-[10px] font-bold text-black sm:text-xs"><Check size={14} />{shortAddress(wallet)}<span className="ml-1">▾</span></button>{walletMenu && <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-white/20 bg-[#20211d] p-1 font-mono text-[10px] shadow-2xl"><button onClick={changeWallet} className="block w-full rounded-lg px-3 py-3 text-left text-white/75 hover:bg-white/10">CHANGE WALLET</button><button onClick={disconnect} className="block w-full rounded-lg px-3 py-3 text-left text-[#ff795f] hover:bg-white/10">DISCONNECT</button></div>}</> : <button onClick={connect} className="flex items-center gap-2 rounded-full border border-white/25 px-4 py-3 font-mono text-[10px] font-bold transition-colors hover:bg-white hover:text-black sm:text-xs"><Wallet size={14} /><span className="hidden sm:inline">CONNECT </span>WALLET</button>}</div>
        </div>
      </nav>
    </header>
    {roundTab ? <Round wallet={wallet} ready={ready} notice={notice} setNotice={setNotice} connect={connect} /> : view === "docs" ? <DocsView onRound={() => navigate("round")} /> : <HomeView onRound={() => navigate("round")} />}
    {view === "home" && notice && <p role="status" className="mx-auto max-w-7xl px-5 pb-5 font-mono text-xs text-[#ff997c]">{notice}</p>}
  </div>;
}

function HomeView({ onRound }: { onRound: () => void }) {
  const reducedMotion = useReducedMotion();
  const [live, setLive] = useState<ChainRound | null>(null);
  const [nextConfig, setNextConfig] = useState<NextConfig | null>(null);
  const [remaining, setRemaining] = useState("—");
  const [readError, setReadError] = useState(false);
  const clock = useRef({ chain: 0, local: 0 });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/rounds?summary=1", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as RoundsResponse;
        if (!response.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        setLive(data.rounds.find((round) => round.id === data.currentId) ?? null);
        setNextConfig(data.nextConfig);
        clock.current = { chain: data.chainTime, local: Date.now() };
        setReadError(false);
      } catch { if (!controller.signal.aborted) setReadError(true); }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const tick = () => setRemaining(!live ? "—" : live.finalized ? "SETTLED" : countdown(Math.max(0, live.endsAt - clock.current.chain - Math.floor((Date.now() - clock.current.local) / 1000))));
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  const entrance = { initial: { opacity: 1, y: reducedMotion ? 0 : 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: .65 } };
  const waitingForNext = !!live && (live.finalized || remaining === "00:00:00");
  const displayedPrice = waitingForNext && nextConfig ? nextConfig.entryFee : live?.entryFee;
  const displayedDuration = waitingForNext && nextConfig ? nextConfig.duration : live ? live.endsAt - live.startsAt : null;
  const duration = displayedDuration === null ? "—" : durationLabel(displayedDuration);
  return <main>
    <section className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-4 overflow-hidden px-5 pb-12 pt-12 sm:px-8 sm:pt-16 lg:min-h-[690px] lg:grid-cols-[1.08fr_1fr] lg:gap-0 lg:pb-16">
      <motion.div {...entrance} className="relative z-10 min-w-0">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.03] px-3 py-2 font-mono text-[10px] tracking-[.12em]"><span className="h-1.5 w-1.5 rounded-full bg-[#c5dfa2]" /> FOOT PHOTOS. REAL STAKES.</div>
        <h1 className="text-[clamp(2.85rem,6.6vw,6.1rem)] font-black uppercase leading-[.88] tracking-[-.075em]">Good soles.<br /><span className="text-[#ff653f]">Great stakes.</span></h1>
        <p className="mt-8 max-w-[390px] text-base leading-7 text-[#a7a89c] sm:text-lg">Your camera. Your sole. Your shot at the pool.<br />Snap a foot photo, win the votes, take the prize.</p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <motion.button onClick={onRound} whileHover={reducedMotion ? {} : { y: -3 }} whileTap={{ scale: .97 }} className="flex items-center gap-6 rounded-full bg-[#ff653f] px-7 py-4 text-sm font-bold text-[#171812] shadow-[0_5px_0_#82331f]">Enter the round <ArrowUpRight size={20} /></motion.button>
          <a href="#how-it-works" className="flex items-center gap-2 text-xs font-medium text-[#b9baaf] transition-colors hover:text-white">How it works <ArrowDown size={14} /></a>
        </div>
        <p className="mt-7 flex items-center gap-2 font-mono text-[10px] tracking-wider text-[#777a6c]"><span className="h-1 w-1 rounded-full bg-[#c5dfa2]" /> BUILT ON ROBINHOOD CHAIN</p>
      </motion.div>
      <div className="hero-scene relative mx-auto h-[390px] w-full max-w-[580px] sm:h-[510px] lg:h-[590px]" aria-label="Decorative 3D cartoon foot sculpture">
        <div className="scene-orbit scene-orbit-one" /><div className="scene-orbit scene-orbit-two" />
        <div className="scene-sphere scene-sphere-cream" /><div className="scene-sphere scene-sphere-orange" />
        <span className="absolute left-4 top-8 font-mono text-[9px] tracking-[.22em] text-white/30">THE SOLE HAS LANDED</span>
        <motion.img src="/solefoot-hero.png" alt="Orange 3D cartoon foot with a chrome orbit" fetchPriority="high" draggable={false} className="relative z-[2] h-full w-full object-contain p-4 drop-shadow-[0_30px_30px_rgba(0,0,0,.3)]" animate={reducedMotion ? {} : { y: [0, -14, 0], rotate: [-5, -1, -5] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
        <div className="absolute bottom-14 left-0 z-10 -rotate-6 rounded-xl border border-white/20 bg-[#e5ecda] px-5 py-3 text-[#252a1b] shadow-[4px_6px_0_rgba(0,0,0,.4)]"><span className="font-mono text-[9px] tracking-widest">NO SHOES REQUIRED</span><p className="mt-1 flex items-center gap-2 text-lg font-black"><Footprints size={18} /> Sole purpose.</p></div>
        <div className="absolute right-0 top-16 z-10 flex h-24 w-24 rotate-12 flex-col items-center justify-center rounded-full border-[3px] border-[#ff653f] text-[#ff653f] sm:h-28 sm:w-28"><Trophy size={24} /><span className="mt-1 text-xs font-black">SOLE TO WIN</span><span className="font-mono text-[8px]">EVERY ROUND</span></div>
        <span className="absolute bottom-5 right-4 font-mono text-[9px] tracking-widest text-white/25">SOLEFOOT STUDIO / 001</span>
      </div>
    </section>
    <motion.section {...entrance} className="mx-auto max-w-7xl px-5 sm:px-8">
      <div className="grid overflow-hidden rounded-2xl border border-white/10 bg-[#1d1f19] sm:grid-cols-4">
        {[["CURRENT ROUND", live ? `#${live.id}` : "—", !live ? "Reading contract…" : live.finalized ? "Settled on-chain" : remaining === "00:00:00" ? "Waiting for the next round" : "Open for entries"], ["PRIZE POOL", live ? `${Number(usdg(live.pool))} USDG` : "—", live ? `${live.entryCount} confirmed entries` : "Reading contract…"], [waitingForNext ? "NEXT ROUND ENTRY PRICE" : "ENTRY PRICE", displayedPrice ? `${Number(usdg(displayedPrice))} USDG` : "—", waitingForNext ? "Applies when the keeper opens the next round" : "Paid into the round pool"], ["TIME LEFT", remaining, waitingForNext ? `Next round length: ${duration}` : `${duration} round`]].map(([label, value, note], index) => <div key={label} className="border-b border-white/10 p-6 last:border-0 sm:border-b-0 sm:border-r"><p className="font-mono text-[9px] tracking-widest text-[#898f7c]">{label}</p><p className={`mt-3 text-2xl font-bold tracking-tight ${index === 3 ? "font-mono text-[#c5dfa2]" : "text-[#f1f0e7]"}`}>{value}</p><p className="mt-2 text-[11px] text-[#777e6b]">{note}</p></div>)}
      </div>
      {readError && <p role="status" className="mt-3 font-mono text-xs text-[#ff997c]">Live round data is temporarily unavailable. Retrying…</p>}
    </motion.section>
    <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
      <motion.div {...entrance} className="flex flex-wrap items-end justify-between gap-5"><div><p className="font-mono text-[10px] tracking-[.2em] text-[#ff8c6e]">A LITTLE WEIRD. PRETTY SIMPLE.</p><h2 className="mt-4 text-4xl font-bold tracking-[-.055em] sm:text-5xl">Put your best foot forward.</h2></div><p className="max-w-[220px] text-sm leading-6 text-[#8d9282]">Three steps from a camera snap<br className="hidden sm:block" /> to a shot at the prize.</p></motion.div>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[{ n: "01", title: "Snap your sole.", text: "Open your camera and take a fresh foot photo. One entry per wallet, per round.", icon: Camera, tone: "#ff653f" }, { n: "02", title: "Let the votes talk.", text: "Pay the round’s USDG entry fee and join the gallery. Each wallet gets one vote.", icon: Heart, tone: "#c5dfa2" }, { n: "03", title: "Walk away a winner.", text: "The top-voted entry gets 70% of the pool; 30% goes to buyback. A solo entrant gets 100%.", icon: Trophy, tone: "#e9e4d5" }].map(({ n, title, text, icon: Icon, tone }) => <motion.article key={n} {...entrance} whileHover={reducedMotion ? {} : { y: -6 }} className="step-card rounded-[22px] border border-white/10 bg-[#1b1d17] p-7"><div className="flex items-center justify-between"><span className="font-mono text-xs text-[#717862]">/ {n}</span><div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 shadow-[inset_0_2px_2px_rgba(255,255,255,.2),0_8px_14px_rgba(0,0,0,.25)]" style={{ background: tone, color: "#292d21", transform: "rotate(-8deg)" }}><Icon size={29} strokeWidth={1.6} /></div></div><h3 className="mt-9 text-2xl font-bold tracking-[-.04em]">{title}</h3><p className="mt-3 max-w-[270px] text-sm leading-6 text-[#969c88]">{text}</p></motion.article>)}
      </div>
    </section>
    <motion.section {...entrance} className="mx-auto mb-16 max-w-7xl px-5 sm:px-8">
      <div className="relative overflow-hidden rounded-[28px] bg-[#e5ecda] p-8 text-[#23291b] sm:p-12"><div className="relative z-10 max-w-[600px]"><p className="font-mono text-[10px] tracking-[.2em] text-[#6c775c]">LESS SCROLLING. MORE SOLE.</p><h2 className="mt-4 text-4xl font-black leading-none tracking-[-.06em] sm:text-6xl">Got a winning sole?</h2><p className="mt-4 max-w-sm text-sm leading-6 text-[#626e52]">Your next photo could be the next winning entry. The gallery, votes and payout receipts are all in the round.</p><button onClick={onRound} className="mt-6 flex items-center gap-8 rounded-full bg-[#24291c] px-6 py-4 text-sm font-bold text-[#e5ecda] transition-colors hover:bg-[#ff653f] hover:text-black">Show me the round <ArrowUpRight size={18} /></button></div><img src="/solefoot-hero.png" alt="" loading="lazy" aria-hidden="true" className="pointer-events-none absolute -bottom-20 -right-14 hidden h-[410px] rotate-[30deg] opacity-90 lg:block" /></div>
    </motion.section>
    <footer className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-7 sm:px-8"><p className="text-xl font-black tracking-[-.06em]">solefoot<span className="text-[#ff653f]">.</span></p><p className="font-mono text-[9px] tracking-widest text-[#767e68]">A LITTLE SOLE GOES A LONG WAY.</p><a href={`https://robinhoodchain.blockscout.com/address/${CONTRACT}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-mono text-[10px] text-[#9ca68a] hover:text-white">VIEW CONTRACT <ArrowUpRight size={14} /></a></div></footer>
  </main>;
}

function DocsView({ onRound }: { onRound: () => void }) {
  const reducedMotion = useReducedMotion();
  const [config, setConfig] = useState<NextConfig | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/rounds?summary=1", { cache: "no-store", signal: controller.signal });
        const data = await response.json() as RoundsResponse;
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) { setConfig(data.nextConfig); setFailed(false); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
    };
    void load(); const timer = window.setInterval(() => void load(), 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  const reveal = { initial: { y: reducedMotion ? 0 : 12 }, whileInView: { y: 0 }, viewport: { once: true }, transition: { duration: .5 } };
  const links = [
    { name: "Round contract", address: CONTRACT, note: "Entries, votes, winner selection and USDG payouts.", tag: "CONTRACT", icon: Trophy },
    { name: "Keeper contract", address: KEEPER_CONTRACT, note: "Settles ended rounds and starts the next one.", tag: "CONTRACT", icon: Clock3 },
    { name: "USDG", address: USDG, note: "The payment token used for entries and prizes.", tag: "TOKEN", icon: Wallet },
    { name: "Buyback treasury", address: TREASURY, note: "Receives the 30% treasury share. This wallet also signs the VPS keeper transactions.", tag: "WALLET", icon: ShieldCheck },
  ];
  return <main className="mx-auto max-w-7xl px-5 pb-12 sm:px-8">
    <section className="grid items-center gap-4 border-b border-white/10 pb-10 pt-12 md:grid-cols-[1.3fr_.7fr] sm:pt-16">
      <motion.div {...reveal}>
        <p className="flex items-center gap-2 font-mono text-[10px] tracking-[.2em] text-[#aab59a]"><BookOpen size={14} /> SOLEFOOT / THE FIELD GUIDE</p>
        <h1 className="mt-6 text-5xl font-black leading-[.95] tracking-[-.065em] sm:text-7xl">Sole business.<br /><span className="text-[#ff7957]">Serious rules.</span></h1>
        <p className="mt-6 max-w-lg text-base leading-7 text-[#a5ad97]">A foot-photo contest with real stakes. Snap your sole, enter the round and collect votes. The contract picks the winner and sends the prize to their wallet.</p>
        <div className="mt-7 flex flex-wrap gap-2 font-mono text-[10px]">{[["Entering", "entering"], ["Payouts", "payouts"], ["Automation", "automation"], ["Addresses", "addresses"]].map(([label, id]) => <a key={id} href={`#docs-${id}`} className="rounded-full border border-white/15 px-4 py-2 text-[#bcc6ad] transition-colors hover:border-[#c5dfa2] hover:text-white">{label} ↗</a>)}</div>
      </motion.div>
      <div className="relative mx-auto h-[270px] w-full max-w-[340px] sm:h-[340px]">
        <div className="absolute inset-8 rounded-full bg-[#242a1d]" />
        <motion.div animate={reducedMotion ? {} : { rotate: [-9, -3, -9], y: [0, -7, 0] }} transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }} className="absolute inset-0"><Image src="/solefoot-hero.png" alt="Orange cartoon foot illustrating the solefoot field guide" fill sizes="340px" className="object-contain" /></motion.div>
        <div className="absolute bottom-2 right-0 rotate-6 rounded-xl bg-[#e5ecda] px-4 py-3 font-mono text-xs font-bold text-[#354126] shadow-[4px_5px_0_#080b06]">Read first.<br />Then put your foot in.</div>
      </div>
    </section>

    <motion.section {...reveal} className="mt-8 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-white/10 bg-[#1d2118] p-6">
      <div><p className="font-mono text-[10px] tracking-widest text-[#a4b98b]">NEXT ROUND SETTINGS</p><p className="mt-2 text-sm text-[#909d80]">Read from the contract. A round keeps the settings it started with.</p></div>
      <div className="flex gap-8"><div><p className="font-mono text-[9px] text-[#8b977c]">ENTRY PRICE</p><p className="mt-1 text-xl font-bold">{config ? `${Number(usdg(config.entryFee))} USDG` : "—"}</p></div><div><p className="font-mono text-[9px] text-[#8b977c]">ROUND LENGTH</p><p className="mt-1 text-xl font-bold">{config ? durationLabel(config.duration) : "—"}</p></div></div>
      {failed && <p role="status" className="w-full text-xs text-[#ff997c]">Current settings are unavailable. Retrying.</p>}
    </motion.section>

    <section id="docs-entering" className="scroll-mt-8 py-16">
      <p className="font-mono text-[10px] tracking-[.2em] text-[#ff997c]">01 / ENTERING</p>
      <h2 className="mt-3 text-3xl font-bold tracking-[-.045em] sm:text-4xl">Three steps. Five toes.</h2>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {[{ icon: Camera, title: "Snap your sole.", text: "Connect your wallet to Robinhood Chain. Open your camera and take a fresh foot photo. A preview is not a confirmed entry." }, { icon: Wallet, title: "Confirm your entry.", text: "Pay the round’s entry price in USDG. Your photo appears in the gallery only after the payment and entry transaction is confirmed on-chain." }, { icon: Heart, title: "Make your vote count.", text: "Each wallet gets one entry and one vote per round. The photo with the most votes wins. A wallet cannot vote twice in the same round." }].map(({ icon: Icon, title, text }, i) => <motion.article key={title} {...reveal} className="rounded-2xl border border-white/10 bg-[#1b1e17] p-6"><div className="flex items-center justify-between"><Icon size={23} className="text-[#c5dfa2]" /><span className="font-mono text-xs text-[#747f64]">0{i + 1}</span></div><h3 className="mt-6 text-xl font-bold tracking-tight">{title}</h3><p className="mt-3 text-sm leading-6 text-[#9ba68c]">{text}</p></motion.article>)}
      </div>
    </section>

    <section id="docs-payouts" className="scroll-mt-8 border-t border-white/10 py-14">
      <p className="font-mono text-[10px] tracking-[.2em] text-[#ff997c]">02 / PAYOUTS</p>
      <h2 className="mt-3 text-3xl font-bold tracking-[-.045em] sm:text-4xl">Where does the pool go?</h2>
      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <motion.article {...reveal} className="rounded-[24px] border border-white/10 bg-[#1b1e17] p-7"><p className="font-mono text-[10px] text-[#919d81]">TWO OR MORE ENTRANTS</p><div className="mt-6 flex h-3 overflow-hidden rounded-full"><div className="w-[70%] bg-[#ff7957]" /><div className="w-[30%] bg-[#c5dfa2]" /></div><div className="mt-5 grid grid-cols-2 gap-4"><div><p className="text-5xl font-black tracking-tight text-[#ff7957]">70%</p><p className="mt-2 text-sm text-[#a7b296]">To the winner’s wallet</p></div><div><p className="text-5xl font-black tracking-tight text-[#c5dfa2]">30%</p><p className="mt-2 text-sm text-[#a7b296]">To the buyback treasury</p></div></div><p className="mt-7 border-t border-white/10 pt-5 text-sm leading-6 text-[#939f83]">The contract sends USDG directly to both addresses. The treasury transfer is automatic; buying tokens with treasury funds is currently managed manually.</p></motion.article>
        <motion.article {...reveal} className="relative overflow-hidden rounded-[24px] bg-[#e5ecda] p-7 text-[#29361e]"><p className="font-mono text-[10px] text-[#748367]">JUST ONE ENTRANT</p><h3 className="mt-5 text-3xl font-bold tracking-tight">Flying sole? Keep it all.</h3><p className="mt-4 max-w-[330px] text-sm leading-6 text-[#627553]">If only one person enters a round, they receive the entire pool. No USDG is sent to the buyback wallet.</p><div className="relative z-10 mt-6 flex gap-8"><div><p className="text-5xl font-black tracking-tight">100%</p><p className="mt-2 text-xs">To the sole entrant</p></div><div><p className="text-5xl font-black tracking-tight text-[#849570]">0%</p><p className="mt-2 text-xs text-[#72865f]">Buyback share</p></div></div><p className="relative z-10 mt-7 text-xs text-[#6a7c5c]">No separate claim transaction is needed. Gas costs are not part of the prize pool.</p><Footprints size={110} strokeWidth={1} className="absolute -bottom-5 -right-5 -rotate-12 text-[#b4c4a0]" /></motion.article>
      </div>
      <p className="mt-5 text-sm text-[#929f81]">With no entrants, there is no payout. The keeper closes the round and starts the next one.</p>
    </section>

    <section id="docs-automation" className="scroll-mt-8 border-t border-white/10 py-14">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[.2em] text-[#ff997c]">03 / AUTOMATION</p><h2 className="mt-3 text-3xl font-bold tracking-[-.045em] sm:text-4xl">Time’s up. Payout’s out.</h2></div><span className="flex items-center gap-2 rounded-full border border-[#c5dfa2]/20 px-3 py-2 font-mono text-[10px] text-[#b3c59e]"><Clock3 size={13} /> KEEPER FLOW</span></div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Round opens", "The keeper uses the configured next-round settings."], ["Votes come in", "The contract updates the leader as votes arrive."], ["Time runs out", "The VPS bot calls the keeper contract."], ["Prize goes out", "The winner is paid and the next round starts."]].map(([title, text], i) => <div key={title} className="rounded-2xl border border-white/10 p-5"><p className="font-mono text-[10px] text-[#ff997c]">0{i + 1} →</p><h3 className="mt-4 text-base font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#95a287]">{text}</p></div>)}</div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-[#1b1e17] p-6 text-sm leading-6 text-[#9daa8f]">In the normal contest flow, nobody manually selects the winner or sends the prize. The keeper settles the round, pays out and starts the next one. The VPS bot must be running and its signing wallet needs ETH for gas. If automation stops, an ended round can remain pending.</div>
      <div className="mt-9 grid items-center gap-5 rounded-2xl border border-white/10 p-5 sm:grid-cols-[130px_1fr]"><div className="relative h-32"><Image src="/solefoot-hero.png" alt="" fill sizes="130px" className="rotate-[25deg] object-contain" /></div><div><p className="text-lg font-bold">Receipts on. Socks off.</p><p className="mt-2 text-sm leading-6 text-[#97a48a]">The Round tab shows the winning photo, wallet, prize amount and payout transaction for completed rounds. Follow the explorer link to verify the transfer on-chain.</p></div></div>
    </section>

    <section id="docs-addresses" className="scroll-mt-8 border-t border-white/10 py-14">
      <p className="font-mono text-[10px] tracking-[.2em] text-[#ff997c]">04 / ADDRESS BOOK</p><h2 className="mt-3 text-3xl font-bold tracking-[-.045em] sm:text-4xl">Follow the footprints.</h2><p className="mt-3 text-sm text-[#97a48a]">Robinhood Chain mainnet · Chain ID 4663. Every link opens Blockscout.</p>
      <div className="mt-7 grid gap-4 md:grid-cols-2">{links.map(({ name, address, note, tag, icon: Icon }) => <a key={address} href={`https://robinhoodchain.blockscout.com/address/${address}`} target="_blank" rel="noreferrer" className="group min-w-0 rounded-2xl border border-white/10 bg-[#1b1e17] p-6 transition-colors hover:border-[#c5dfa2]/40"><div className="flex items-center justify-between"><Icon size={21} className="text-[#c5dfa2]" /><span className="font-mono text-[9px] tracking-wider text-[#859774]">{tag} ↗</span></div><h3 className="mt-4 text-lg font-bold">{name}</h3><p className="mt-2 text-sm leading-6 text-[#94a185]">{note}</p><p className="mt-4 break-all rounded-lg bg-black/20 p-3 font-mono text-[10px] leading-5 text-[#c3ccba]">{address}</p></a>)}</div>
    </section>

    <section className="border-t border-white/10 py-12"><h2 className="text-2xl font-bold tracking-tight">Small print. Clear answers.</h2><div className="mt-6 divide-y divide-white/10">{[
      ["What happens if votes are tied?", "A tie keeps the current leader. The entry that reached that score first stays ahead. If nobody votes, the first entry wins."],
      ["Where is my photo stored?", "The photo and its metadata are stored on IPFS. Its link, owner and vote count are recorded in the contract. A camera preview is not added to the gallery until the entry payment is confirmed."],
      ["Is everything automatic?", "Winner selection, payouts and the next round run automatically through the contract and keeper. Users approve photo submissions and votes in their wallets. Token purchases using accumulated treasury USDG are currently manual."],
      ["What can the administrator change?", "The administrator can update the next round’s entry price, duration, treasury address and optional token requirement. A started round keeps its original settings."],
      ["What is the emergency withdrawal?", "The contract owner can withdraw all USDG to the original deployer’s wallet and permanently stop the game. This authority includes the active prize pool."],
    ].map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold"><span>{question}</span><span className="text-xl font-normal text-[#9bad85] group-open:rotate-45">+</span></summary><p className="mt-3 max-w-3xl text-sm leading-7 text-[#95a588]">{answer}</p></details>)}</div></section>
    <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-[#e5ecda] p-6 text-[#2c3821]"><div><p className="text-xl font-bold tracking-tight">Know the rules. Bring the sole.</p><p className="mt-1 text-sm text-[#6b7a5c]">Explore the gallery and the current round.</p></div><button onClick={onRound} className="flex items-center gap-5 rounded-full bg-[#2a3520] px-6 py-3 text-sm font-bold text-[#e5ecda]">Go to the round <ArrowUpRight size={18} /></button></div>
  </main>;
}

function Round({ wallet, ready, notice, setNotice, connect }: { wallet: string | null; ready: boolean; notice: string; setNotice: (v: string) => void; connect: () => void }) {
  const [roundId, setRoundId] = useState<bigint | null>(null); const [pool, setPool] = useState<bigint>(0n); const [entries, setEntries] = useState<bigint>(0n); const [endsAt, setEndsAt] = useState(0); const [chainNow, setChainNow] = useState(0); const [syncedAt, setSyncedAt] = useState(0); const [timeLeft, setTimeLeft] = useState("—"); const [finalized, setFinalized] = useState(false); const [preview, setPreview] = useState<string | null>(null); const [entryConfirmed, setEntryConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [tx, setTx] = useState(""); const [open, setOpen] = useState(false); const [error, setError] = useState(""); const video = useRef<HTMLVideoElement>(null); const stream = useRef<MediaStream | null>(null);
  const [currentRound, setCurrentRound] = useState<ChainRound | null>(null);
  const [nextConfig, setNextConfig] = useState<NextConfig | null>(null);
  const [history, setHistory] = useState<ChainRound[]>([]);
  const [oldestLoaded, setOldestLoaded] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  async function fetchRounds(before?: number) {
    const response = await fetch(`/api/rounds${before ? `?before=${before}` : ""}`, { cache: "no-store" });
    const body = await response.json() as RoundsResponse;
    if (!response.ok) throw new Error(body.error || "Could not read rounds.");
    const current = body.rounds.find((round) => round.id === body.currentId);
    if (before === undefined && current) {
      setCurrentRound(current);
      setNextConfig(body.nextConfig);
      setRoundId(BigInt(current.id));
      setPool(BigInt(current.pool));
      setEntries(BigInt(current.entryCount));
      setEndsAt(current.endsAt);
      setFinalized(current.finalized);
      setChainNow(body.chainTime);
      setSyncedAt(Date.now());
    }
    const past = body.rounds.filter((round) => round.id !== body.currentId || before !== undefined);
    setHistory((previous) => {
      const merged = new Map(previous.map((round) => [round.id, round]));
      past.forEach((round) => merged.set(round.id, round));
      return [...merged.values()].sort((a, b) => b.id - a.id);
    });
    if (body.rounds.length) setOldestLoaded((oldest) => Math.min(oldest ?? Infinity, body.rounds[body.rounds.length - 1].id));
  }
  async function refresh() { try { await fetchRounds(); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not read round."); } }
  async function loadOlder() { if (!oldestLoaded || loadingOlder) return; setLoadingOlder(true); try { await fetchRounds(oldestLoaded); } catch (e) { setNotice(e instanceof Error ? e.message : "Could not load older rounds."); } finally { setLoadingOlder(false); } }
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 15000); return () => window.clearInterval(timer); }, []); useEffect(() => { const tick = () => { if (finalized) return setTimeLeft("SETTLED"); const estimatedChainNow = chainNow + Math.floor((Date.now() - syncedAt) / 1000); const remaining = Math.max(0, endsAt - estimatedChainNow); setTimeLeft(endsAt && syncedAt ? countdown(remaining) : "—"); }; tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }, [endsAt, chainNow, syncedAt, finalized]); useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []); useEffect(() => { if (open && video.current && stream.current) video.current.srcObject = stream.current; }, [open]);
  async function submit() { if (!wallet) return connect(); if (!preview) return setNotice("Take a real camera photo first."); setBusy(true); setEntryConfirmed(false); try { setNotice("Uploading camera photo to IPFS..."); const imageBlob = await fetch(preview).then((response) => response.blob()); const form = new FormData(); form.append("file", imageBlob, `sole-${Date.now()}.jpg`); const uploadResponse = await fetch("/api/upload", { method: "POST", body: form }); const uploadText = await uploadResponse.text(); let upload: { uri?: string; error?: unknown } = {}; try { upload = JSON.parse(uploadText) as { uri?: string; error?: unknown }; } catch { throw new Error(`Upload API returned ${uploadResponse.status}: ${uploadText.slice(0, 300) || "empty response"}`); } const uploadError = typeof upload.error === "string" ? upload.error : JSON.stringify(upload.error); if (!uploadResponse.ok || !upload.uri) throw new Error(uploadError || "IPFS upload failed."); const [currentHex, blockTime] = await Promise.all([call(CONTRACT, S.current), latestBlockTimestamp()]); const currentId = word(currentHex, 0); if (!currentId) throw new Error("No active round yet. Wait for the keeper to start one."); const currentRound = await call(CONTRACT, S.round + u(currentId)); if (word(currentRound, 14) !== 0n || Number(word(currentRound, 1)) <= blockTime + 10) throw new Error("Round ended while uploading. Wait for the next round and submit again."); const entryFee = word(currentRound, 4); if (entryFee <= 0n) throw new Error("Invalid round entry price."); setNotice(`Photo uploaded. Approve ${usdg(entryFee.toString())} USDG to submit...`); const approval = await send(wallet, USDG, S.approve + pad(CONTRACT) + u(entryFee)); setTx(approval); const bytes = new TextEncoder().encode(upload.uri); const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); const data = S.submit + u(32) + u(bytes.length) + hex.padEnd(Math.ceil(bytes.length / 32) * 64, "0"); const h = await send(wallet, CONTRACT, data); setTx(h); setEntryConfirmed(true); setPreview(null); setNotice(`Photo confirmed on-chain in Round #${currentId}. It now appears in that round gallery.`); await refresh(); } catch (e) { setEntryConfirmed(false); setNotice(e instanceof Error ? e.message : "submitEntry failed."); } finally { setBusy(false); } }
  async function vote(entryId: number) { if (!wallet) return connect(); if (!currentRound || currentRound.finalized || !currentRound.entries.some((entry) => entry.id === entryId)) return; setBusy(true); try { const h = await send(wallet, CONTRACT, S.vote + u(entryId)); setTx(h); setNotice(`Vote for entry #${entryId} confirmed on-chain.`); await refresh(); } catch (e) { setNotice(e instanceof Error ? e.message : "Vote failed."); } finally { setBusy(false); } }
  async function camera() { try { stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }); setOpen(true); } catch { setError("Camera permission was denied or camera is unavailable."); } }
  function capture() { const v = video.current; if (!v?.videoWidth) return; const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d")?.drawImage(v, 0, 0); setPreview(c.toDataURL("image/jpeg", .88)); setEntryConfirmed(false); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setOpen(false); }
  const completedWithEntries = history.filter((round) => round.finalized && round.entryCount > 0);
  const awaitingNextRound = !!currentRound && (finalized || timeLeft === "00:00:00");
  const displayedEntryPrice = awaitingNextRound && nextConfig ? nextConfig.entryFee : currentRound?.entryFee;
  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-10 border-b border-white/15 pb-8">
        <p className="font-mono text-xs tracking-[.2em] text-[#ff795f]">ROUND {roundId ? String(roundId) : "—"} / MAINNET</p>
        <h1 className="mt-4 text-6xl font-black tracking-[-.08em] sm:text-8xl">THE<br /><span className="text-[#ff5b3d]">ROUND.</span></h1>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="border border-white/15 bg-[#191919] p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
            <span><i className={`mr-2 inline-block h-2 w-2 rounded-full ${finalized ? "bg-[#c8ff55]" : "bg-[#ff5b3d]"}`} />CONTRACT STATUS</span>
            <span className={finalized ? "text-[#c8ff55]" : "text-[#ff795f]"}>{!currentRound ? "READING CONTRACT…" : finalized ? "SETTLED / ON-CHAIN" : timeLeft === "00:00:00" ? "AWAITING NEXT ROUND" : "ROUND OPEN"}</span>
          </div>
          <div className="mt-10">
            <p className="font-mono text-xs text-white/45">POOL BALANCE</p>
            <p className="mt-2 text-5xl font-black">{usdg(pool.toString())}</p>
            <p className="text-sm text-white/45">USDG · {String(entries)} CONFIRMED ENTRIES</p>
            <p className="mt-2 font-mono text-xs text-white/45">{awaitingNextRound ? "NEXT ROUND ENTRY PRICE" : "ENTRY PRICE"} · {displayedEntryPrice ? `${Number(usdg(displayedEntryPrice))} USDG` : "—"}</p>
            {awaitingNextRound && nextConfig && <p className="mt-3 rounded-lg border border-[#c5dfa2]/20 bg-[#c5dfa2]/5 p-3 text-xs leading-5 text-[#c5dfa2]">The keeper will open the next round at {Number(usdg(nextConfig.entryFee))} USDG for {durationLabel(nextConfig.duration)}.</p>}
            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="font-mono text-xs text-white/45">TIME LEFT</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[#c8ff55]">{timeLeft}</p>
            </div>
          </div>
        </div>

        <div className="border border-[#ff5b3d] bg-[#ff5b3d] p-7 text-black">
          <div className="flex justify-between"><Camera /><span className="font-mono text-xs">CAMERA ONLY</span></div>
          {open ? <>
            <video ref={video} autoPlay playsInline muted className="mt-8 aspect-[4/3] w-full bg-black object-cover" />
            <button onClick={capture} className="mt-4 w-full bg-black px-4 py-3 font-mono text-xs font-bold text-white">CAPTURE FOOT</button>
          </> : <button onClick={camera} className="mt-12 w-full border-2 border-dashed border-black/30 p-8 font-bold">{preview ? "RETAKE FOOT PHOTO" : "OPEN CAMERA"}</button>}
          {error && <p className="mt-3 font-mono text-xs font-bold">{error}</p>}
          {preview && <div className="relative mt-5">
            <img src={preview} alt="Camera capture preview" className="max-h-52 w-full object-cover" />
            <span className={`absolute bottom-2 left-2 px-2 py-1 font-mono text-[10px] font-bold ${entryConfirmed ? "bg-[#c8ff55] text-black" : "bg-black/80 text-white"}`}>{entryConfirmed ? "ON-CHAIN ENTRY CONFIRMED" : "LOCAL PREVIEW — NOT SUBMITTED"}</span>
          </div>}
          <button onClick={submit} disabled={busy || !preview || !ready || !currentRound || finalized || timeLeft === "00:00:00"} className="mt-5 w-full bg-black px-4 py-3 font-mono text-xs font-bold text-white disabled:opacity-40">{busy ? "UPLOADING / SUBMITTING..." : "APPROVE USDG + SUBMIT"}</button>
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-[#ff795f]">LIVE GALLERY</p>
            <h2 className="mt-2 text-3xl font-black">Round #{currentRound?.id ?? "—"} entries</h2>
          </div>
          <p className="font-mono text-xs text-white/45">Only confirmed on-chain entries appear here.</p>
        </div>
        {currentRound?.entries.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {currentRound.entries.map((entry) => (
              <article key={entry.id} className="overflow-hidden border border-white/15 bg-[#191919]">
                <div className="relative aspect-[4/3] bg-[#242424]">
                  {entry.image ? <img src={entry.image} alt={`Round ${currentRound.id} entry ${entry.id}`} className="h-full w-full object-cover" /> : <a href={`https://gateway.pinata.cloud/ipfs/${entry.metadataURI.slice(7)}`} target="_blank" rel="noreferrer" className="flex h-full items-center justify-center p-6 text-center font-mono text-xs text-white/50">IMAGE UNAVAILABLE · OPEN METADATA</a>}
                  <span className="absolute left-3 top-3 bg-black/80 px-2 py-1 font-mono text-xs">#{entry.id}</span>
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div><p className="font-mono text-[10px] text-white/40">OWNER</p><p className="font-mono text-xs">{shortAddress(entry.owner)}</p><p className="mt-1 font-mono text-xs text-[#c8ff55]">{entry.votes} VOTES</p></div>
                  <button onClick={() => void vote(entry.id)} disabled={busy || currentRound.finalized || timeLeft === "00:00:00"} className="flex items-center gap-2 bg-[#ff5b3d] px-4 py-2 font-mono text-xs font-bold text-black disabled:opacity-40"><Heart size={14} /> VOTE</button>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="border border-dashed border-white/20 p-8 font-mono text-sm text-white/45">No paid entries in this round yet.</div>}
        {currentRound && currentRound.entryCount > currentRound.entries.length && <p className="mt-3 font-mono text-xs text-white/45">Showing the first {currentRound.entries.length} of {currentRound.entryCount} entries.</p>}
      </section>

      <section className="mt-14 border-t border-white/15 pt-10">
        <p className="font-mono text-xs text-[#ff795f]">SETTLED ON-CHAIN</p>
        <h2 className="mt-2 text-3xl font-black">Previous round winners</h2>
        <p className="mt-2 text-sm text-white/45">Winner, payout and transaction are read from the contract and its event logs.</p>
        <div className="mt-6 grid gap-5">
          {completedWithEntries.map((round) => {
            const winner = round.entries.find((entry) => entry.id === round.winningEntryId);
            return <article key={round.id} className="grid overflow-hidden border border-white/15 bg-[#191919] md:grid-cols-[220px_1fr]">
              <div className="aspect-[4/3] bg-[#242424] md:aspect-auto">
                {winner?.image ? <img src={winner.image} alt={`Winning entry for round ${round.id}`} className="h-full w-full object-cover" /> : <div className="flex h-full min-h-48 items-center justify-center font-mono text-xs text-white/40">WINNER IMAGE UNAVAILABLE</div>}
              </div>
              <div className="p-5">
                <p className="font-mono text-xs text-[#c8ff55]">ROUND #{round.id} WINNER · ENTRY #{round.winningEntryId}</p>
                <p className="mt-2 font-mono text-sm">{winner ? shortAddress(winner.owner) : "Winner record unavailable"}</p>
                <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 font-mono text-xs sm:grid-cols-3">
                  <div><p className="text-white/40">POOL</p><p className="mt-1 text-lg font-bold">{usdg(round.pool)} USDG</p></div>
                  <div><p className="text-white/40">WINNER PAID</p><p className="mt-1 text-lg font-bold text-[#c8ff55]">{usdg(round.winnerAmount)} USDG</p></div>
                  <div><p className="text-white/40">BUYBACK TREASURY</p><p className="mt-1 text-lg font-bold">{usdg(round.buybackAmount)} USDG</p></div>
                </div>
                {round.finalizationTx ? <a href={`https://robinhoodchain.blockscout.com/tx/${round.finalizationTx}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 font-mono text-xs font-bold text-[#ff795f]">VIEW PAYOUT TX <ExternalLink size={14} /></a> : <p className="mt-4 font-mono text-xs text-white/40">Payout TX lookup pending</p>}
              </div>
            </article>;
          })}
          {!completedWithEntries.length && <p className="border border-dashed border-white/20 p-7 font-mono text-sm text-white/45">No winning photo in loaded rounds. Load older rounds to find previous results.</p>}
        </div>
        {oldestLoaded !== null && oldestLoaded > 1 && <button onClick={() => void loadOlder()} disabled={loadingOlder} className="mt-6 border border-white/25 px-5 py-3 font-mono text-xs font-bold disabled:opacity-40">{loadingOlder ? "LOADING..." : "LOAD OLDER ROUNDS"}</button>}
      </section>

      {(notice || tx) && <div className="mt-8 border border-[#ff5b3d]/40 bg-[#ff5b3d]/10 p-4 font-mono text-xs text-[#ff795f]">{notice}{tx && <a href={`https://robinhoodchain.blockscout.com/tx/${tx}`} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-[#c8ff55]">LAST ACTION TX <ExternalLink size={12} /></a>}</div>}
    </main>
  );
}
