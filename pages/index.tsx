import React, { useEffect, useState } from "react";

type Match = { id:number; title:string; video_url:string };
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

type SavedJob = { job_id: string; match_id: number; title: string };

const JOBS_KEY = "fe:pending-jobs";

function loadJobs(): SavedJob[] {
  try { return JSON.parse(localStorage.getItem(JOBS_KEY) || "[]"); } catch { return []; }
}
function saveJobs(jobs: SavedJob[]) {
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}
function upsertJob(j: SavedJob) {
  const jobs = loadJobs().filter(x => x.job_id !== j.job_id);
  jobs.push(j);
  saveJobs(jobs);
}
function removeJob(job_id: string) {
  saveJobs(loadJobs().filter(j => j.job_id !== job_id));
}


export default function Home() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");
  const [activeJob, setActiveJob] = useState<SavedJob | null>(null);

  useEffect(() => {
    fetch(process.env.NEXT_PUBLIC_API_BASE + "/matches")
      .then(r => r.json())
      .then(setMatches)
      .catch(console.error);
  }, []);
  useEffect(() => {
    const pending = loadJobs();
    setActiveJob(pending[pending.length - 1] || null);
  }, []);
  async function pollJob(
    job: SavedJob,
    setCurrentStep: (s: string) => void,
    onFinished: (job: SavedJob) => Promise<void>
  ) {
    let done = false;
    while (!done) {
      const s = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/jobs/${job.job_id}`).then(r => r.json());
      const pct = typeof s.progress === "number" ? `${s.progress}%` : "0%";
      const note = s.note || s.status || "";
      setCurrentStep(`${pct} — ${note}`);

      if (s.status === "finished") {
        setCurrentStep("Running analytics…");
        await onFinished(job);
        setCurrentStep("Processing complete!");
        removeJob(job.job_id);
        done = true;
      } else if (["failed","stopped","canceled"].includes(s.status)) {
        setCurrentStep("0% — failed");
        removeJob(job.job_id);
        throw new Error(s.exc || "Job failed");
      } else {
        await sleep(1500);
      }
    }
  }

  useEffect(() => {
    const pending = loadJobs();
    if (!pending.length) return;

    // Show the latest job’s status in the banner
    const last = pending[pending.length - 1];

    pollJob(last, setCurrentStep, async (job) => {
      // run your fast analytics after the pipeline finishes
      await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analytics/positions?match_id=${job.match_id}`),
        fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analytics/possession?match_id=${job.match_id}&max_dist_m=4`),
        fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analytics/control_zones?match_id=${job.match_id}&stride=5`),
        fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analytics/momentum?match_id=${job.match_id}&stride=5`),
      ]);

      // refresh matches list
      const refreshed = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/matches`).then(r => r.json());
      setMatches(refreshed);
    }).catch((e) => {
      console.error(e);
    });
  }, []);


  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    setUploading(true);
    setCurrentStep("Uploading video...");
    setUploadError("");

    try {
      // Upload video
      const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/ingest/video`, {
        method: 'POST',
        body: formData
      });
      
      if (!uploadRes.ok) throw new Error("Failed to upload video");
      const match: Match = await uploadRes.json();

      // Enqueue pipeline job
      setCurrentStep("Queued…");
      const jobRes = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/jobs/pipeline?match_id=${match.id}&conf_thres=0.1`, { method: "POST" });
      if (!jobRes.ok) throw new Error("Failed to enqueue processing job");
      const { job_id } = await jobRes.json();

      const title = (formData.get("title") as string) || `Match ${match.id}`;
      upsertJob({ job_id, match_id: match.id, title });

      // Poll job status
      await pollJob({ job_id, match_id: match.id, title }, setCurrentStep, async (job) => {
        // run analytics (fast)
        await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analytics/positions?match_id=${job.match_id}`),
          fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analytics/possession?match_id=${job.match_id}&max_dist_m=4`),
          fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analytics/control_zones?match_id=${job.match_id}&stride=5`),
          fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analytics/momentum?match_id=${job.match_id}&stride=5`),
        ]);

        // refresh matches list
        const refreshed = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/matches`).then(r => r.json());
        setMatches(refreshed);
      });
      
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setUploading(false);
    }
  };

  return (
    <main style={{padding:20}}>
      <div style={{ display: "flex", gap: "2rem" }}>
        <div style={{ flex: 1 }}>
          <h1>Matches</h1>
          <ul>
            {matches.map(m => (
              <li key={m.id}>
                <a href={`/match/${m.id}`}>{m.title}</a>
              </li>
            ))}
          </ul>
        </div>
        
        <div style={{ flex: 1 }}>
          <h1>Upload New Match</h1>
          <form onSubmit={handleUpload} style={{ marginTop: "1rem" }}>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="title" style={{ display: "block", marginBottom: "0.5rem" }}>Match Title:</label>
              <input 
                type="text" 
                id="title" 
                name="title" 
                required 
                style={{ 
                  width: "100%", 
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px"
                }} 
              />
            </div>
            
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="file" style={{ display: "block", marginBottom: "0.5rem" }}>Video File:</label>
              <input 
                type="file" 
                id="file" 
                name="file" 
                required 
                accept="video/*"
                style={{ 
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px"
                }} 
              />
            </div>
            
            <button 
              type="submit" 
              disabled={uploading}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: uploading ? "#ccc" : "#0070f3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: uploading ? "not-allowed" : "pointer"
              }}
            >
              {uploading ? "Processing..." : "Upload Video"}
            </button>
          </form>
          
          {currentStep && (
            <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f0f9ff", borderRadius: "4px" }}>
              <p>{currentStep}</p>
            </div>
          )}
          
          {uploadError && (
            <div style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fee2e2", borderRadius: "4px", color: "#dc2626" }}>
              <p>{uploadError}</p>
            </div>
          )}
          {activeJob && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
              Processing: <strong>{activeJob.title}</strong> (match #{activeJob.match_id})
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
