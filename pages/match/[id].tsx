import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

type Match = { id:number; title:string; video_url:string };
type Detection = {
  frame_id: number;
  filename: string;
  class_name: string;
  conf: number;
  x1: number; y1: number; x2: number; y2: number;
  object_id: number | null;
};
type Track = { match_id:number; object_id:number; n_samples:number; team_id:number };

const TEAM_COLORS: Record<number, { stroke: string; fill: string }> = {
  1: { stroke: "rgba(220,38,38,0.9)",  fill: "rgba(220,38,38,0.15)" }, // red-600
  2: { stroke: "rgba(37,99,235,0.9)",  fill: "rgba(37,99,235,0.15)" }, // blue-600
};
const TRAIL_WINDOW = 20;
const PITCH_M = 105;
const PITCH_N = 68;

const getColorForClass = (className: string): { stroke: string; fill: string } => {
    switch (className.toLowerCase()) {
        case 'referee':
            return { stroke: '#FFD700', fill: 'rgba(255, 215, 0, 0.15)' }; // yellow
        case 'player':
            return { stroke: '#f87171', fill: 'rgba(248, 113, 113, 0.15)' }; // red
        case 'goalkeeper':
            return { stroke: '#00FFFF', fill: 'rgba(0, 255, 255, 0.15)' }; // cyan
        case 'ball':
            return { stroke: '#FFA500', fill: 'rgba(255, 165, 0, 0.15)' }; // orange
        default:
            return { stroke: '#60a5fa', fill: 'rgba(96, 165, 250, 0.15)' }; // default blue
    }
};

async function fetchTracks(matchId: number) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/matches/${matchId}/tracks`);
  if (!r.ok) return [] as Track[];
  return (await r.json()) as Track[];
}

async function assignTeams(matchId: number) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/teams/assign?match_id=${matchId}`, { method: "POST" });
  return r.ok;
}

const invert3x3 = (H: number[][]): number[][] | null => {
  const a=H[0][0], b=H[0][1], c=H[0][2];
  const d=H[1][0], e=H[1][1], f=H[1][2];
  const g=H[2][0], h=H[2][1], i=H[2][2];
  const A =   e*i - f*h, B = -(d*i - f*g), C =   d*h - e*g;
  const D = -(b*i - c*h), E =   a*i - c*g, F = -(a*h - b*g);
  const G =   b*f - c*e, H2 = -(a*f - c*D?e:a*f - c*e), I =   a*e - b*d; // we'll recompute H2 properly below
  // fix minor typo and compute properly:
  const G2 =  b*f - c*e;
  const H3 = -(a*f - c*d);
  const I2 =  a*e - b*d;
  const det = a*A + b*B + c*C;
  if (!isFinite(det) || Math.abs(det) < 1e-12) return null;
  const inv = [
    [A/det, D/det, G2/det],
    [B/det, E/det, H3/det],
    [C/det, F/det, I2/det],
  ];
  return inv;
};

const projectPitchToImage = (Hinv: number[][], X: number, Y: number) => {
  // multiply [X,Y,1]^T by Hinv
  const x = Hinv[0][0]*X + Hinv[0][1]*Y + Hinv[0][2]*1;
  const y = Hinv[1][0]*X + Hinv[1][1]*Y + Hinv[1][2]*1;
  const w = Hinv[2][0]*X + Hinv[2][1]*Y + Hinv[2][2]*1;
  if (!isFinite(w) || Math.abs(w) < 1e-9) return null;
  return { x: x / w, y: y / w }; // image pixel coords
};

export default function MatchPage() {
    const router = useRouter();
    const { id } = router.query;
    const [match, setMatch] = useState<Match | null>(null);
    const [detections, setDetections] = useState<Detection[]>([]);
    const [loadingDetections, setLoadingDetections] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [tracksMap, setTracksMap] = useState<Record<number, number>>({});
    const [loadingAssign, setLoadingAssign] = useState(false);
    const [homography, setHomography] = useState<any[]>([]);
    const [showPitch, setShowPitch] = useState(false);

    useEffect(() => {
        if (!id) return;
        fetch(process.env.NEXT_PUBLIC_API_BASE + "/matches")
            .then(r => r.json())
            .then((rows: Match[]) => {
            const m = rows.find(x => x.id === Number(id));
            if (m) {
                setMatch(m);
            }
            })
            .catch(console.error);
    }, [id]);

    const getStyledColors = (d: Detection): { stroke: string; fill: string } => {
      if (d.class_name.toLowerCase() === "player" && d.object_id !== null) {
        const teamId = tracksMap[d.object_id];
        if (teamId && TEAM_COLORS[teamId]) return TEAM_COLORS[teamId];
      }
      return getColorForClass(d.class_name);
    };

    async function loadHomography() {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/matches/${Number(id)}/homography`);
      if (r.ok) setHomography(await r.json());
    }
    console.log(homography);
    const drawPitchOverlay = (
                                ctx: CanvasRenderingContext2D,
                                H: number[][],
                                wFactor: number,
                                hFactor: number
                              ) => {
      const Hinv = invert3x3(H);
      if (!Hinv) return;

      // helper to draw a line in pitch coords by sampling points
      const drawPitchLine = (p1: [number, number], p2: [number, number], stroke = "rgba(6, 153, 163, 0.9)") => {
        const STEPS = 64;
        const pts: {x:number;y:number}[] = [];
        for (let s = 0; s <= STEPS; s++) {
          const t = s / STEPS;
          const X = p1[0] + (p2[0] - p1[0]) * t;
          const Y = p1[1] + (p2[1] - p1[1]) * t;
          const p = projectPitchToImage(Hinv, X, Y);
          if (p) pts.push({ x: p.x*wFactor, y: p.y*hFactor });
        }
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
        ctx.stroke();
      };

      // sidelines (y=0, y=N) and goal lines (x=0, x=M)
      drawPitchLine([0,0], [PITCH_M,0]);             // top sideline
      drawPitchLine([0,PITCH_N], [PITCH_M,PITCH_N]); // bottom sideline
      drawPitchLine([0,0], [0,PITCH_N]);             // left goal line
      drawPitchLine([PITCH_M,0], [PITCH_M,PITCH_N]); // right goal line

      // midline x = M/2
      drawPitchLine([PITCH_M/2, 0], [PITCH_M/2, PITCH_N], "rgba(59,130,246,0.9)");

      // optional: six-yard boxes (very rough; adjust to your canonical map)
      const sixX = 5.5;
      drawPitchLine([sixX, PITCH_N*0.25], [sixX, PITCH_N*0.75], "rgba(16,185,129,0.6)");
      drawPitchLine([PITCH_M-sixX, PITCH_N*0.25], [PITCH_M-sixX, PITCH_N*0.75], "rgba(16,185,129,0.6)");
    };

    const drawBoxes = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        
        console.log("draw function triggered");
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        //if (!detections || detections.length === 0) return;

        const t = Math.floor(video.currentTime*25); // 25 fps frames
        const wFactor = canvas.width / (video.videoWidth || canvas.width);
        const hFactor = canvas.height / (video.videoHeight || canvas.height);
        console.log("draw function triggered without detections");
        // === pitch overlay (before boxes), if enabled ===
        if (showPitch && Array.isArray(homography) && homography.length > 0) {
          let seg = homography.find((s: any) => t >= s.frame_start && t <= s.frame_end);
          console.log("Drawing pitch overlay");
          if (showPitch && seg?.keypoints_img?.length) {
            ctx.save();
            // Draw dots and labels
            ctx.fillStyle = "rgba(182, 16, 185, 0.9)";
            ctx.strokeStyle = "rgba(182, 16, 185, 0.9)";
            ctx.lineWidth = 4;
            ctx.font = "12px sans-serif";

            // Create a map of keypoints for easy access
            const keypoints = new Map<string, {x: number, y: number}>(seg.keypoints_img.map(kp => [kp.name, { 
              x: kp.x * wFactor, 
              y: kp.y * hFactor 
            }]));

            // Draw dots and labels first
            for (const kp of seg.keypoints_img) {
              const x = kp.x * wFactor;
              const y = kp.y * hFactor;
              ctx.beginPath();
              ctx.arc(x, y, 3, 0, Math.PI*2);
              ctx.fill();
              //ctx.fillText(kp.name, x + 6, y - 6);
            }

            // Define the connections to draw
            const connections = [
              ["corner_top_left", "left_penalty_box_top_left"],
              ["left_penalty_box_top_left", "left_six_box_top_left"],
              ["left_six_box_top_left", "left_six_box_bottom_left"],
              ["left_six_box_bottom_left", "left_penalty_box_bottom_left"],
              ["left_penalty_box_bottom_left", "corner_bottom_left"],
              ["left_penalty_box_top_left", "left_penalty_box_top_right"],
              ["left_six_box_top_left", "left_six_box_top_right"],
              ["left_six_box_bottom_left", "left_six_box_bottom_right"],
              ["left_penalty_box_bottom_left", "left_penalty_box_bottom_right"],
              ["left_six_box_top_right", "left_six_box_bottom_right"],
              ["left_penalty_box_top_right", "left_penalty_box_center_top"],
              ["left_penalty_box_center_top", "left_penalty_box_center_bottom"],
              ["left_penalty_box_center_bottom", "left_penalty_box_bottom_right"],
              ["center_top", "center_circle_top"],
              ["center_circle_top", "center_circle_bottom"],
              ["center_circle_bottom", "center_bottom"],
              ["corner_top_left", "center_top"],
              ["corner_bottom_left", "center_bottom"],
              ["center_top", "corner_top_right"],
              ["center_bottom", "corner_bottom_right"],
              
              ["corner_top_right", "right_penalty_box_top_right"],
              ["right_penalty_box_top_right", "right_six_box_top_right"],
              ["right_six_box_top_right", "right_six_box_bottom_right"],
              ["right_six_box_bottom_right", "right_penalty_box_bottom_right"],
              ["right_penalty_box_bottom_right", "corner_bottom_right"],
              ["right_penalty_box_top_right", "right_penalty_box_top_left"],
              ["right_six_box_top_right", "right_six_box_top_left"],
              ["right_six_box_bottom_right", "right_six_box_bottom_left"],
              ["right_penalty_box_bottom_right", "right_penalty_box_bottom_left"],
              ["right_six_box_top_left", "right_six_box_bottom_left"],
              ["right_penalty_box_top_left", "right_penalty_box_center_top"],
              ["right_penalty_box_center_top", "right_penalty_box_center_bottom"],
              ["right_penalty_box_center_bottom", "right_penalty_box_bottom_left"],
            ];

            // Draw the connections
            ctx.strokeStyle = "rgba(59,130,246,0.9)"; // blue color
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (const [start, end] of connections) {
              const startPoint = keypoints.get(start);
              const endPoint = keypoints.get(end);
              if (startPoint && endPoint) {
                ctx.moveTo(startPoint.x, startPoint.y);
                ctx.lineTo(endPoint.x, endPoint.y);
              }
            }
            ctx.stroke();
            
            ctx.restore();
          }
        }

        if (!detections || detections.length === 0) return;

        // --- draw trails (look back a small window) ---
        const byId: Record<string, { x: number; y: number; frame: number }[]> = {};
        for (let f = Math.max(0, t - TRAIL_WINDOW); f <= t; f++) {
            const dets = detections.filter(d => d.frame_id === f && d.object_id !== null);
            dets.forEach(d => {
                const id = String(d.object_id);
                const cx = ((d.x1 + d.x2) / 2) * wFactor;
                const cy = ((d.y1 + d.y2) / 2) * hFactor;
                if (!byId[id]) byId[id] = [];
                byId[id].push({ x: cx, y: cy, frame: f });
            });
        }
        Object.keys(byId).forEach(id => {
            const pts = byId[id];
            if (pts.length < 2) return;
            // Find the detection for this object to get its class
            const det = detections.find(d => d.object_id === Number(id));
            if (!det) return;
            const colors = det ? getStyledColors(det) : { stroke: "#60a5fa", fill: "rgba(96, 165, 250, 0.15)" };
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = colors.stroke;
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
        });

        // --- draw current-frame boxes + labels ---
        detections
            .filter(d => d.frame_id === t)
            .forEach(d => {
                const x = d.x1 * wFactor;
                const y = d.y1 * hFactor;
                const w = (d.x2 - d.x1) * wFactor;
                const h = (d.y2 - d.y1) * hFactor;

                const colors = getStyledColors(d);
                ctx.lineWidth = 2;
                
                if (d.class_name.toLowerCase() === 'ball') {
                    // Draw downward-pointing triangle
                    const centerX = x + w/2;
                    const topY = y;  // Top position
                    const triangleSize = Math.min(w, h) * 0.8;  // Triangle size relative to box
                    
                    ctx.beginPath();
                    ctx.moveTo(centerX - triangleSize/2, topY); // top left
                    ctx.lineTo(centerX + triangleSize/2, topY); // top right
                    ctx.lineTo(centerX, topY + triangleSize);   // bottom point
                    ctx.closePath();
                    ctx.fillStyle = colors.fill;
                    ctx.strokeStyle = colors.stroke;
                    ctx.fill();
                    ctx.stroke();
                } else {
                    // Draw ground ellipse (partial arc: -45° → 235°)
                    const bottomY = y + h;  // Y coordinate of the bottom
                    const centerX = x + w / 2;
                    const ellipseHeight = h * 0.12;  // Height of ellipse is 10% of original height

                    // convert degrees to radians
                    const startRad = (-45 * Math.PI) / 180;
                    const endRad = (235 * Math.PI) / 180;

                    ctx.beginPath();
                    ctx.ellipse(
                      centerX,          // center x
                      bottomY,          // center y (at the bottom)
                      w * 0.7,          // radiusX (half the original width)
                      ellipseHeight,    // radiusY (small height for perspective)
                      0,                // rotation
                      startRad,         // start angle (in radians)
                      endRad,           // end angle (in radians)
                      false             // draw clockwise
                    );

                    // stroke only (no fill) to get just the arc segment
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = colors.stroke;
                    ctx.stroke();
                }

                const idText = d.object_id !== null ? `#${d.object_id}` : "";
                const confPercent = Math.round(d.conf * 100);
                const text = `${idText}`.trim();
                ctx.font = "12px sans-serif";
                ctx.fillStyle = "#111827";
                ctx.fillText(text, x + 2, y - 4 < 10 ? y + 12 : y - 4);
            });
    };


    const handleRunDetection = async () => {
        if (!id) return;
        setLoadingDetections(true);
        try {
            await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analyze/detections?match_id=${id}`);
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/matches/${id}/detections`);
            const data: Detection[] = await res.json();
            setDetections(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingDetections(false);
        }
    };

  if (!match) return <div style={{padding:20}}>Loading…</div>;

  return (
    <main style={{padding:20}}>
      <h2>{match.title}</h2>
      <div style={{ position: "relative", width: 960, maxWidth: "100%" }}>
        <video
          ref={videoRef}
          controls
          width={960}
          src={match.video_url}
          onTimeUpdate={drawBoxes}
          onLoadedMetadata={drawBoxes}
          style={{ width: "100%" }}
        />
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        />
      </div>
      <div style={{ marginTop: 20 }}>
        <button
          onClick={handleRunDetection}
          disabled={loadingDetections}
          style={{ padding: "8px 16px", cursor: "pointer" }}
        >
          {loadingDetections ? "Processing…" : "Run Detection"}
        </button>
        {detections.length > 0 && (
          <p style={{ marginTop: 10 }}>
            Loaded {detections.length} detections. Scrub the video to see boxes.
          </p>
        )}
        <button
          onClick={async () => {
            if (!id) return;
            try {
              setLoadingAssign(true);
              const ok = await assignTeams(Number(id));
              if (ok) {
                const rows = await fetchTracks(Number(id));
                const map: Record<number, number> = {};
                rows.forEach(t => { map[t.object_id] = t.team_id; });
                setTracksMap(map);
                // redraw with new colors
                drawBoxes();
              }
            } finally {
              setLoadingAssign(false);
            }
          }}
          disabled={loadingAssign}
          style={{ marginLeft: 12, padding: "8px 16px", cursor: "pointer" }}
        >
          {loadingAssign ? "Assigning…" : "Assign Teams"}
        </button>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <i style={{ width: 12, height: 12, background: TEAM_COLORS[1].stroke, display: "inline-block", borderRadius: 2 }} />
            Team 1
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <i style={{ width: 12, height: 12, background: TEAM_COLORS[2].stroke, display: "inline-block", borderRadius: 2 }} />
            Team 2
          </span>
        </div>
        <label style={{ marginLeft: 12 }}>
          <input type="checkbox" checked={showPitch} onChange={(e)=>{setShowPitch(e.target.checked); drawBoxes();}} /> Show Pitch Lines
        </label>
        <button style={{ marginLeft: 8 }} onClick={loadHomography}>Load Homography</button>
      </div>
    </main>
  );
}
