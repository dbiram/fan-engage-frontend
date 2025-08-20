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
const TRAIL_WINDOW = 10;

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

        const t = Math.floor(video.currentTime); // 1 fps frames
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
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#60a5fa"; // blue trails
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

                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.lineWidth = 2;
                ctx.strokeStyle = "#f87171"; // red boxes
                ctx.fillStyle = "rgba(248, 113, 113, 0.15)";
                ctx.fillRect(x, y, w, h);
                ctx.stroke();

                const idText = d.object_id !== null ? `#${d.object_id}` : "";
                const text = `${d.class_name} ${idText}`.trim();
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
