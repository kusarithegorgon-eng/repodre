import React from "react";

const BG = "#F8FAFC"; // 60
const FG = "#1E293B"; // 30
const ACC = "#0D9488"; // 10

export function Hero3D() {
  return (
    <div className="mx-auto flex w-full items-center justify-center">
      <div
        className="relative flex-none overflow-visible rounded-2xl"
        style={{ width: 420, height: 320, perspective: 1200 }}
        aria-hidden
      >
        <div
          className="absolute inset-0"
          style={{
            transform: "rotateX(18deg) rotateY(-22deg) translateZ(0)",
            transformStyle: "preserve-3d",
            WebkitTransformStyle: "preserve-3d",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg"
            style={{
              width: 380,
              height: 260,
              background: "linear-gradient(180deg, rgba(248,250,252,0.85), rgba(248,250,252,0.6))",
              boxShadow: "0 8px 30px rgba(16,24,40,0.08)",
              borderRadius: 16,
              transform: "translateZ(0px)",
            }}
          />

          {/* Connection lines SVG */}
          <svg
            viewBox="0 0 380 260"
            className="absolute left-[50%] top-[50%] -translate-x-1/2 -translate-y-1/2"
            style={{ width: 380, height: 260, overflow: "visible" }}
          >
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g stroke={ACC} strokeWidth={1.5} fill="none" style={{ filter: "url(#glow)" }}>
              <path d="M 70 60 L 190 40 L 310 80" strokeOpacity={0.9} strokeLinecap="round" />
              <path d="M 80 180 L 200 140 L 300 160" strokeOpacity={0.75} strokeLinecap="round" />
              <path d="M 120 90 L 160 180" strokeOpacity={0.6} strokeLinecap="round" />
            </g>
          </svg>

          {/* Nodes */}
          <div
            className="absolute left-[72px] top-[36px] node"
            style={nodeStyle(ACC)}
          >
            <div style={nodeInnerStyle(FG)}>HomePage.tsx</div>
          </div>

          <div
            className="absolute left-[192px] top-[20px] node"
            style={nodeStyle(ACC)}
          >
            <div style={nodeInnerStyle(FG)}>GET /api/repos</div>
          </div>

          <div
            className="absolute left-[292px] top-[76px] node"
            style={nodeStyle(ACC)}
          >
            <div style={nodeInnerStyle(FG)}>repos (DB)</div>
          </div>

          <div
            className="absolute left-[176px] top-[156px] node"
            style={nodeStyle(ACC)}
          >
            <div style={nodeInnerStyle(FG)}>Auth</div>
          </div>

          <style>{`
            .node { width: 120px; height: 44px; border-radius: 10px; display:flex; align-items:center; justify-content:center; }
            .node div { width:100%; text-align:center; font-weight:600; font-size:13px; }
            @keyframes floatY { 0% { transform: translateZ(0) translateY(0px); } 50% { transform: translateZ(8px) translateY(-6px); } 100% { transform: translateZ(0) translateY(0px); } }
            .node { animation: floatY 4s ease-in-out infinite; }
          `}</style>
        </div>
      </div>
    </div>
  );
}

function nodeStyle(accent: string): React.CSSProperties {
  return {
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    background: "rgba(248,250,252,0.45)",
    border: `1px solid ${accent}`,
    boxShadow: `0 4px 18px rgba(13,148,136,0.12), 0 0 10px ${accent}33`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#0f1724",
    transformStyle: "preserve-3d",
  };
}

function nodeInnerStyle(color: string): React.CSSProperties {
  return {
    color,
    padding: "0 10px",
    textShadow: "0 1px 0 rgba(255,255,255,0.4)",
  };
}
