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
const TRAIL_WINDOW = 20;

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

export default function MatchPage() {
    const router = useRouter();
    const { id } = router.query;
    const [match, setMatch] = useState<Match | null>(null);
    const [detections, setDetections] = useState<Detection[]>([]);
    const [loadingDetections, setLoadingDetections] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const drawBoxes = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!detections || detections.length === 0) return;

        const t = Math.floor(video.currentTime*25); // 25 fps frames
        const wFactor = canvas.width / (video.videoWidth || canvas.width);
        const hFactor = canvas.height / (video.videoHeight || canvas.height);

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
            const colors = getColorForClass(det.class_name);
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

                const colors = getColorForClass(d.class_name);
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
                const text = `${d.class_name} (${confPercent}%) ${idText}`.trim();
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
      </div>
    </main>
  );
}
