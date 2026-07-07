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

interface Cam {
  tx: number;
  ty: number;
  zoom: number;
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

// シーン(ステージ)はビューポートより横に広く、スワイプで左右にパンできる。
const STAGE_VW = 150;

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
      data-wid={wish.id}
      style={{
        position: "absolute",
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
          position: "relative",
          transformOrigin: "50% 0%",
          animation: `swing ${swingDur}s ease-in-out ${swingDelay}s infinite alternate`,
        }}
      >
        <img
          src={asset(`tanzaku_${wish.color}.png`)}
          alt=""
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            filter: "drop-shadow(0 6px 10px rgba(0,0,20,0.45))",
          }}
          draggable={false}
        />
        <p
          style={{
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            top: "27%",
            bottom: "7%",
            left: "16%",
            right: "16%",
            margin: 0,
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
  const [cam, setCam] = useState<Cam | null>(null);
  const [smooth, setSmooth] = useState(false);

  const starVideoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<Cam | null>(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, startTx: 0 });
  const focusTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = useRef(100);

  // ---- カメラ(ステージのパン/ズーム)ヘルパ ----
  const stageWpx = () => (window.innerWidth * STAGE_VW) / 100;
  const defaultCam = useCallback((): Cam => {
    return { tx: (window.innerWidth - stageWpx()) / 2, ty: 0, zoom: 1 };
  }, []);
  const clampTx = (tx: number, zoom: number) => {
    const min = window.innerWidth - stageWpx() * zoom;
    return Math.max(min, Math.min(0, tx));
  };

  // マウント時にカメラを中央にセット。camRef は state と同期。
  useEffect(() => {
    const c = defaultCam();
    camRef.current = c;
    setCam(c);
    const onResize = () => {
      const dc = defaultCam();
      camRef.current = dc;
      setCam(dc);
      setSmooth(false);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [defaultCam]);
  useEffect(() => {
    camRef.current = cam;
  }, [cam]);

  // 表示中ビューポートの高さ1%を --vh として供給(ツールバーで高さが変わる端末補正)。
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

  // Android等で muted+autoPlay でも自動再生がブロックされることがあるため明示再生。
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

  // ---- 視線誘導: 新しい短冊へカメラをズーム/パンして戻る ----
  // タイマーは ref 管理(再レンダーで消えないように)。
  const focusTanzaku = useCallback(
    (id: number) => {
      focusTimers.current.forEach(clearTimeout);
      focusTimers.current = [];
      // drop-in が落ち着いて DOM に出てから位置を測る
      focusTimers.current.push(
        setTimeout(() => {
          const el = stageRef.current?.querySelector<HTMLElement>(
            `[data-wid="${id}"]`
          );
          const c = camRef.current;
          if (!el || !c) return;
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          // 画面座標 → ステージ座標(現在の transform を逆算)
          const sx = (cx - c.tx) / c.zoom;
          const sy = (cy - c.ty) / c.zoom;
          const Z = 1.9;
          const focus: Cam = {
            tx: window.innerWidth / 2 - sx * Z,
            ty: window.innerHeight / 2 - sy * Z,
            zoom: Z,
          };
          setSmooth(true);
          camRef.current = focus;
          setCam(focus);
          // 少し見せてから既定位置へ戻す
          focusTimers.current.push(
            setTimeout(() => {
              const dc = defaultCam();
              camRef.current = dc;
              setCam(dc);
              focusTimers.current.push(
                setTimeout(() => setSmooth(false), 1000)
              );
            }, 2400)
          );
        }, 300)
      );
    },
    [defaultCam]
  );

  useEffect(() => {
    const timers = focusTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

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
    focusTanzaku(wish.id); // 視線誘導のトリガ

    const video = starVideoRef.current;
    if (video) {
      video.currentTime = 0;
      setShooting(true);
      video.play().catch(() => setShooting(false));
    }
  };

  const burstSparks = useCallback(
    (clientX: number, clientY: number) => {
      const base = Date.now();
      const burst: Spark[] = Array.from({ length: 8 }, (_, i) => ({
        id: base + i,
        x: clientX,
        y: clientY,
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
    },
    []
  );

  // ---- スワイプ(左右パン) + タップ(星屑) ----
  const onPointerDown = (e: React.PointerEvent) => {
    playBg();
    if ((e.target as HTMLElement).closest("form")) return; // フォーム操作は無効
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startTx: camRef.current?.tx ?? 0,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      d.moved = true;
      setSmooth(false);
    }
    if (d.moved) {
      const c = camRef.current;
      if (!c) return;
      const nc: Cam = { ...c, tx: clampTx(d.startTx + dx, c.zoom) };
      camRef.current = nc;
      setCam(nc);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d.active && !d.moved && !(e.target as HTMLElement).closest("form")) {
      burstSparks(e.clientX, e.clientY);
    }
    d.active = false;
  };

  const stageTransform = cam
    ? `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.zoom})`
    : "translateX(-25vw)"; // JS 起動前の中央寄せフォールバック

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 overflow-hidden select-none bg-black"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "calc(var(--vh, 1vh) * 100)",
        overflow: "hidden",
        background: "#000",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* パン/ズームするシーン(ステージ)。背景・飾り・竹を載せる。 */}
      <div
        ref={stageRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${STAGE_VW}vw`,
          height: "100%",
          transformOrigin: "0 0",
          transform: stageTransform,
          transition: smooth ? "transform 0.85s ease" : "none",
          willChange: "transform",
        }}
      >
        {/* 背景: 天の川の動画(読み込み中は poster の静止画)。ステージ全幅を覆う。 */}
        <video
          ref={bgVideoRef}
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

        {/* 願い事送信時の流れ星(黒背景動画をスクリーン合成) */}
        <video
          ref={starVideoRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            mixBlendMode: "screen",
            pointerEvents: "none",
            opacity: shooting ? 1 : 0,
            transition: "opacity 0.5s",
          }}
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
          style={{
            position: "absolute",
            pointerEvents: "none",
            top: "calc(var(--vh, 1vh) * -2)",
            left: "28vw",
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
          style={{
            position: "absolute",
            pointerEvents: "none",
            opacity: 0.9,
            top: "calc(var(--vh, 1vh) * -3)",
            left: "44vw",
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
          style={{
            position: "absolute",
            pointerEvents: "none",
            top: "calc(var(--vh, 1vh) * 40)",
            left: "34vw",
            height: "13vmin",
            animation: "floaty 6s ease-in-out infinite",
          }}
          draggable={false}
        />

        {/* 提灯 */}
        <img
          src={asset("lantern.png")}
          alt=""
          style={{
            position: "absolute",
            pointerEvents: "none",
            bottom: "calc(var(--vh, 1vh) * 22)",
            left: "30vw",
            height: "17vmin",
            transformOrigin: "50% 0%",
            animation:
              "swing 4.5s ease-in-out infinite alternate, lantern-glow 3s ease-in-out infinite",
            ["--swing-from" as string]: "-2deg",
            ["--swing-to" as string]: "2deg",
          }}
          draggable={false}
        />

        {/* 笹と短冊。ステージ中央に配置(サイズは .bamboo=CSS のみ)。 */}
        <div
          style={{
            position: "absolute",
            left: "75vw",
            bottom: "-3vh",
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="bamboo"
            style={{
              position: "relative",
              transformOrigin: "50% 100%",
              animation: "bamboo-sway 6s ease-in-out infinite alternate",
            }}
          >
            <img
              src={asset("bamboo.png")}
              alt="笹"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              draggable={false}
            />
            {wishes.map((wish, i) => (
              <Tanzaku key={wish.id} wish={wish} slot={i % SLOTS.length} />
            ))}
          </div>
        </div>
      </div>

      {/* ===== 固定オーバーレイ(パンしない) ===== */}

      {/* タイトル */}
      <h1
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          margin: 0,
          whiteSpace: "nowrap",
          textAlign: "center",
          top: "calc(var(--vh, 1vh) * 3)",
          fontSize: "4.5vmin",
          textShadow:
            "0 0 14px rgba(140,160,255,0.8), 0 2px 12px rgba(10,5,40,0.9)",
          letterSpacing: "0.25em",
        }}
      >
        七夕かざり
        <span
          style={{
            display: "block",
            opacity: 0.8,
            fontSize: "0.42em",
            letterSpacing: "0.35em",
            marginTop: "0.4em",
          }}
        >
          〜 星に願いを 〜
        </span>
      </h1>

      {/* 願い事フォーム */}
      <form
        onSubmit={addWish}
        style={{
          position: "absolute",
          left: "4vw",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "16px",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(30,27,75,0.72)",
          boxShadow: "0 8px 32px rgba(0,0,20,0.5)",
          width: "86vw",
          maxWidth: "330px",
          bottom: "calc(var(--vh, 1vh) * 4)",
        }}
      >
        <label htmlFor="wish" style={{ fontSize: "14px", opacity: 0.9, letterSpacing: "0.1em" }}>
          願い事を短冊に
        </label>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            id="wish"
            type="text"
            value={input}
            maxLength={20}
            onChange={(e) => setInput(e.target.value)}
            placeholder="例: 早起きできますように"
            style={{
              minWidth: 0,
              flex: "1 1 auto",
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.1)",
              color: "#f2ecff",
              padding: "8px 12px",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              flex: "0 0 auto",
              borderRadius: "8px",
              border: "none",
              background: "rgba(252,211,77,0.9)",
              color: "#1e1b4b",
              padding: "8px 16px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            飾る
          </button>
        </div>
      </form>

      {/* クリック/タップで散る星屑(黒背景画像をスクリーン合成) */}
      {sparks.map((s) => (
        <img
          key={s.id}
          src={asset("sparkle.jpg")}
          alt=""
          style={{
            position: "absolute",
            pointerEvents: "none",
            mixBlendMode: "screen",
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
