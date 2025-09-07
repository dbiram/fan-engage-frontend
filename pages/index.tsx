import React, { useEffect, useState } from "react";

type Match = { id:number; title:string; video_url:string };

export default function Home() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");

  useEffect(() => {
    fetch(process.env.NEXT_PUBLIC_API_BASE + "/matches")
      .then(r => r.json())
      .then(setMatches)
      .catch(console.error);
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
      
      // Run detections
      setCurrentStep("Running player detections...");
      await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/analyze/detections?match_id=${match.id}`);
      
      // Assign teams
      setCurrentStep("Assigning teams...");
      await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/teams/assign?match_id=${match.id}`, { method: "POST" });
      
      // Calculate homography
      setCurrentStep("Calculating pitch homography...");
      await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/homography/estimate?match_id=${match.id}&segment_frames=25&step=5`, {
        method: 'POST'
      });
      
      setCurrentStep("Processing complete!");
      
      // Refresh matches list
      const matchesRes = await fetch(process.env.NEXT_PUBLIC_API_BASE + "/matches");
      const newMatches = await matchesRes.json();
      setMatches(newMatches);
      
      // Reset form
      form.reset();
      
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
        </div>
      </div>
    </main>
  );
}
