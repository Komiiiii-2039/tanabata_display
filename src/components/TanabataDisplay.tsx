"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type TanzakuColor = "red" | "blue" | "green" | "yellow" | "orange";

interface Wish {
  id: number;
  text: string;
  color: TanzakuColor;
}

interface Spark {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  rot: number;
  size: number;
  delay: number;
}

// 素材を同名で差し替えたらこの値を上げる(ブラウザキャッシュ無効化)
const ASSET_VERSION = "2";

function asset(name: string) {
  return `/assets/${name}?v=${ASSET_VERSION}`;
}

const COLORS: TanzakuColor[] = ["red", "blue", "yellow", "green", "orange"];

const INK: Record<TanzakuColor, string> = {
  red: "#fff6ec",
  blue: "#f2f6ff",
  green: "#1e3a26",
  yellow: "#4a3418",
  orange: "#4d2410",
};

// 笹コンテナ内の短冊の吊り位置(%)。葉の茂りに合わせて手調整済み。
const SLOTS = [
  { top: 10, left: 34 },
  { top: 18, left: 64 },
  { top: 27, left: 10 },
  { top: 33, left: 46 },
  { top: 44, left: 68 },
  { top: 50, left: 22 },
  { top: 60, left: 52 },
  { top: 68, left: 8 },
  { top: 76, left: 38 },
  { top: 40, left: 2 },
];

const MAX_WISHES = SLOTS.length;
const STORAGE_KEY = "tanabata-wishes";

const SEED_WISHES: Wish[] = [
  { id: 1, text: "みんなが健康でありますように", color: "red" },
  { id: 2, text: "織姫と彦星が会えますように", color: "blue" },
];

// id から見た目の揺らぎを決める(乱数だと再描画ごとに変わるため)
function jitter(id: number, salt: number, range: number) {
  const h = Math.abs(Math.sin(id * 127.1 + salt * 311.7)) * 10000;
  return (h - Math.floor(h)) * range;
}

function Tanzaku({ wish, slot }: { wish: Wish; slot: number }) {
  const pos = SLOTS[slot];
  const swingDur = 3.2 + jitter(wish.id, 1, 2.4);
  const swingDelay = -jitter(wish.id, 2, 4);
  const offsetX = jitter(wish.id, 3, 6) - 3;
  const fontVmin =
    wish.text.length <= 7 ? 2.3 : wish.text.length <= 12 ? 1.9 : 1.55;

  return (
    <div
      className="absolute"
      style={{
        top: `${pos.top}%`,
        left: `${pos.left + offsetX}%`,
        width: "9vmin",
        minWidth: "54px",
        maxWidth: "96px",
        animation: "drop-in 0.9s ease-out both",
      }}
    >
      <div
        style={{
          transformOrigin: "50% 0%",
          animation: `swing ${swingDur}s ease-in-out ${swingDelay}s infinite alternate`,
        }}
      >
        <img
          src={asset(`tanzaku_${wish.color}.png`)}
          alt=""
          className="w-full h-auto drop-shadow-[0_6px_10px_rgba(0,0,20,0.45)]"
          draggable={false}
        />
        <p
          className="absolute flex items-center justify-center text-center"
          style={{
            top: "27%",
            bottom: "7%",
            left: "16%",
            right: "16%",
            writingMode: "vertical-rl",
            color: INK[wish.color],
            fontSize: `${fontVmin}vmin`,
            lineHeight: 1.15,
            letterSpacing: "0.06em",
            textShadow: "0 0 3px rgba(0,0,0,0.12)",
          }}
        >
          {wish.text}
        </p>
      </div>
    </div>
  );
}

export default function TanabataDisplay() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [shooting, setShooting] = useState(false);
  const starVideoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(100);

  // 表示中ビューポートの高さ1%を --vh として供給(ブラウザのツールバーで
  // 高さが変わる端末向けの補正)。JS が動かない古い WebView でも、CSS 側は
  // var(--vh, 1vh) のフォールバックで通常の vh として機能するので問題ない。
  useEffect(() => {
    const setVh = () => {
      const el = rootRef.current;
      if (!el) return;
      el.style.setProperty("--vh", `${window.innerHeight / 100}px`);
    };
    setVh();
    window.addEventListener("resize", setVh);
    window.addEventListener("orientationchange", setVh);
    return () => {
      window.removeEventListener("resize", setVh);
      window.removeEventListener("orientationchange", setVh);
    };
  }, []);

  // Android等で muted+autoPlay でも自動再生がブロックされることがあるため、
  // マウント時とユーザー操作時に明示的に再生を試みる(失敗しても静止画にフォールバック)。
  const playBg = useCallback(() => {
    const v = bgVideoRef.current;
    if (v && v.paused) {
      v.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    playBg();
  }, [playBg]);

  useEffect(() => {
    // /?reset で保存済みの短冊をクリアして初期状態に戻す
    if (new URLSearchParams(window.location.search).has("reset")) {
      localStorage.removeItem(STORAGE_KEY);
      window.history.replaceState(null, "", window.location.pathname);
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed: Wish[] = saved ? JSON.parse(saved) : [];
      setWishes(parsed.length > 0 ? parsed : SEED_WISHES);
      nextId.current =
        Math.max(100, ...(parsed.length ? parsed : SEED_WISHES).map((w) => w.id)) + 1;
    } catch {
      setWishes(SEED_WISHES);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wishes));
    }
  }, [wishes, loaded]);

  const addWish = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const wish: Wish = {
      id: nextId.current++,
      text,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
    setWishes((prev) => [...prev, wish].slice(-MAX_WISHES));
    setInput("");

    const video = starVideoRef.current;
    if (video) {
      video.currentTime = 0;
      setShooting(true);
      video.play().catch(() => setShooting(false));
    }
  };

  const burstSparks = useCallback((e: React.PointerEvent) => {
    playBg();
    if ((e.target as HTMLElement).closest("form")) return;
    const base = Date.now();
    const burst: Spark[] = Array.from({ length: 8 }, (_, i) => ({
      id: base + i,
      x: e.clientX,
      y: e.clientY,
      dx: (Math.random() - 0.5) * 180,
      dy: (Math.random() - 0.5) * 180,
      rot: (Math.random() - 0.5) * 90,
      size: 26 + Math.random() * 34,
      delay: Math.random() * 0.12,
    }));
    setSparks((prev) => [...prev, ...burst]);
    setTimeout(
      () => setSparks((prev) => prev.filter((s) => !burst.includes(s))),
      1200
    );
  }, [playBg]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 overflow-hidden select-none bg-black"
      // 決定的なレイアウトは Tailwind クラスに頼らず inline で直接指定する
      // (古い WebView が生成 CSS を解釈できない場合の保険)。
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "calc(var(--vh, 1vh) * 100)",
        overflow: "hidden",
        background: "#000",
      }}
      onPointerDown={burstSparks}
    >
      {/* 背景: 天の川の動画のみ(読み込み中は poster の静止画を表示)。
          画面の長辺に合わせて中央基準でトリミング(object-fit: cover)。
          伸縮させないため cover を inline で確実に指定する。 */}
      <video
        ref={bgVideoRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
        src={asset("milkyway.mp4")}
        poster={asset("sky.jpg")}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onCanPlay={playBg}
      />

      {/* 願い事送信時の流れ星(黒背景動画をスクリーン合成)。
          空の出来事なので竹や飾りの後ろに描画する */}
      <video
        ref={starVideoRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover mix-blend-screen transition-opacity duration-500"
        style={{ opacity: shooting ? 1 : 0 }}
        src={asset("shooting_star.mp4")}
        muted
        playsInline
        preload="auto"
        onEnded={() => setShooting(false)}
      />

      {/* 吹き流し */}
      <img
        src={asset("fukinagashi.png")}
        alt=""
        className="absolute pointer-events-none"
        style={{
          top: "calc(var(--vh, 1vh) * -2)",
          left: "2vw",
          height: "46vmin",
          transformOrigin: "50% 0%",
          animation: "swing 5.5s ease-in-out -1s infinite alternate",
          ["--swing-from" as string]: "-2deg",
          ["--swing-to" as string]: "2deg",
        }}
        draggable={false}
      />

      {/* 網飾り */}
      <img
        src={asset("amikazari.png")}
        alt=""
        className="absolute pointer-events-none opacity-90"
        style={{
          top: "calc(var(--vh, 1vh) * -3)",
          left: "19vw",
          height: "38vmin",
          transformOrigin: "50% 0%",
          animation: "swing 7s ease-in-out -3s infinite alternate",
          ["--swing-from" as string]: "-1.5deg",
          ["--swing-to" as string]: "1.5deg",
        }}
        draggable={false}
      />

      {/* 折り鶴 */}
      <img
        src={asset("crane.png")}
        alt=""
        className="absolute pointer-events-none"
        style={{
          top: "calc(var(--vh, 1vh) * 48)",
          left: "7vw",
          height: "13vmin",
          animation: "floaty 6s ease-in-out infinite",
        }}
        draggable={false}
      />

      {/* 提灯 */}
      <img
        src={asset("lantern.png")}
        alt=""
        className="absolute pointer-events-none"
        style={{
          bottom: "calc(var(--vh, 1vh) * 22)",
          left: "3vw",
          height: "17vmin",
          transformOrigin: "50% 0%",
          animation:
            "swing 4.5s ease-in-out infinite alternate, lantern-glow 3s ease-in-out infinite",
          ["--swing-from" as string]: "-2deg",
          ["--swing-to" as string]: "2deg",
        }}
        draggable={false}
      />

      {/* 笹と短冊。サイズは .bamboo(CSS のみ・JS 非依存)で決める */}
      <div
        className="bamboo absolute"
        style={{
          right: "-6vmin",
          bottom: "-3vh",
          transformOrigin: "50% 100%",
          animation: "bamboo-sway 6s ease-in-out infinite alternate",
        }}
      >
        <img
          src={asset("bamboo.png")}
          alt="笹"
          className="w-full h-full object-contain"
          draggable={false}
        />
        {wishes.map((wish, i) => (
          <Tanzaku key={wish.id} wish={wish} slot={i % SLOTS.length} />
        ))}
      </div>

      {/* タイトル */}
      <h1
        className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-center"
        style={{
          top: "calc(var(--vh, 1vh) * 3)",
          fontSize: "4.5vmin",
          textShadow:
            "0 0 14px rgba(140,160,255,0.8), 0 2px 12px rgba(10,5,40,0.9)",
          letterSpacing: "0.25em",
        }}
      >
        七夕かざり
        <span
          className="block opacity-80"
          style={{ fontSize: "0.42em", letterSpacing: "0.35em", marginTop: "0.4em" }}
        >
          〜 星に願いを 〜
        </span>
      </h1>

      {/* 願い事フォーム */}
      <form
        onSubmit={addWish}
        className="absolute left-[4vw] z-20 flex flex-col gap-2 rounded-2xl border border-white/25 bg-indigo-950/40 p-4 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,20,0.5)]"
        style={{
          width: "86vw",
          maxWidth: "330px",
          bottom: "calc(var(--vh, 1vh) * 4)",
        }}
      >
        <label htmlFor="wish" className="text-sm tracking-widest opacity-90">
          願い事を短冊に
        </label>
        <div className="flex gap-2">
          <input
            id="wish"
            type="text"
            value={input}
            maxLength={20}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例: 早起きできますように"
            className="min-w-0 flex-1 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm placeholder-white/40 outline-none focus:border-amber-200/70 focus:bg-white/15"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-amber-300/90 px-4 py-2 text-sm font-bold text-indigo-950 transition hover:bg-amber-200 active:scale-95"
          >
            飾る
          </button>
        </div>
      </form>

      {/* クリックで散る星屑(黒背景画像をスクリーン合成) */}
      {sparks.map((s) => (
        <img
          key={s.id}
          src={asset("sparkle.jpg")}
          alt=""
          className="pointer-events-none absolute mix-blend-screen"
          style={{
            left: s.x,
            top: s.y,
            width: s.size,
            height: s.size,
            ["--dx" as string]: `${s.dx}px`,
            ["--dy" as string]: `${s.dy}px`,
            ["--rot" as string]: `${s.rot}deg`,
            animation: `sparkle-burst 1s ease-out ${s.delay}s both`,
          }}
        />
      ))}
    </div>
  );
}
