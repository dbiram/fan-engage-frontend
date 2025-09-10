import React from "react";

type PossessionFrame = {
  frame_id: number;
  team: number | null;
  time_s: number;
};

type PossessionData = {
  series: PossessionFrame[];
};

type ControlZoneFrame = {
  frame_id: number;
  time_s: number;
  team1_area_pct: number;
  team2_area_pct: number;
};

type ControlZoneData = {
  series: ControlZoneFrame[];
};

type MomentumFrame = {
  frame_id: number;
  time_s: number;
  team1_momentum: number;
  team2_momentum: number;
};

type MomentumData = {
  series: MomentumFrame[];
};

const TEAM_COLORS: Record<number, { stroke: string; fill: string }> = {
  1: { stroke: "rgba(220,38,38,0.9)",  fill: "rgba(220, 38, 38, 0.65)" }, // red-600
  2: { stroke: "rgba(37,99,235,0.9)",  fill: "rgba(37,99,235,0.65)" }, // blue-600
};

interface AnalyticsProps {
  possessionData: PossessionData | null;
  controlZoneData: ControlZoneData | null;
  momentumData: MomentumData | null;
  currentFrame: number;
}

const Analytics: React.FC<AnalyticsProps> = ({ possessionData, controlZoneData, momentumData, currentFrame }) => {
  const calculatePossessionStats = (currentFrame: number) => {
    if (!possessionData?.series) return { team1: 0, team2: 0, neutral: 0 };
    
    // Get possession data up to current frame
    const relevantFrames = possessionData.series.filter(frame => frame.frame_id <= currentFrame);
    if (relevantFrames.length === 0) return { team1: 0, team2: 0, neutral: 0 };
    
    const team1Frames = relevantFrames.filter(frame => frame.team === 1).length;
    const team2Frames = relevantFrames.filter(frame => frame.team === 2).length;
    const neutralFrames = relevantFrames.filter(frame => frame.team === null).length;
    const totalFrames = relevantFrames.length;
    
    return {
      team1: Math.round((team1Frames / totalFrames) * 100),
      team2: Math.round((team2Frames / totalFrames) * 100),
      neutral: Math.round((neutralFrames / totalFrames) * 100)
    };
  };

  const getCurrentPossession = (currentFrame: number): number | null => {
    if (!possessionData?.series) return null;
    const frameData = possessionData.series.find(frame => frame.frame_id === currentFrame);
    return frameData?.team || null;
  };

  const calculateControlZoneStats = (currentFrame: number) => {
    if (!controlZoneData?.series) return { team1: 0, team2: 0 };
    
    // Get control zone data up to current frame (since there's frame stride, find the closest frame)
    const relevantFrames = controlZoneData.series.filter(frame => frame.frame_id <= currentFrame);
    if (relevantFrames.length === 0) return { team1: 0, team2: 0 };
    
    // Get the most recent frame (closest to current frame)
    const latestFrame = relevantFrames[relevantFrames.length - 1];
    
    return {
      team1: Math.round(latestFrame.team1_area_pct),
      team2: Math.round(latestFrame.team2_area_pct)
    };
  };

  const calculateMomentumStats = (currentFrame: number) => {
    if (!momentumData?.series) return { team1: 0, team2: 0 };
    
    // Get momentum data up to current frame (since there's frame stride, find the closest frame)
    const relevantFrames = momentumData.series.filter(frame => frame.frame_id <= currentFrame);
    if (relevantFrames.length === 0) return { team1: 0, team2: 0 };
    
    // Get the most recent frame (closest to current frame)
    const latestFrame = relevantFrames[relevantFrames.length - 1];
    
    return {
      team1: Math.round(latestFrame.team1_momentum),
      team2: Math.round(latestFrame.team2_momentum)
    };
  };

  if (!possessionData && !controlZoneData && !momentumData) {
    return (
      <div style={{ 
        width: "960px", 
        maxWidth: "100%",
        padding: "20px",
        backgroundColor: "#f8f9fa",
        border: "1px solid #dee2e6",
        borderRadius: "8px"
      }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: "600" }}>Match Analytics</h3>
        <p style={{ color: "#666" }}>Loading analytics...</p>
      </div>
    );
  }

  const stats = calculatePossessionStats(currentFrame);
  const currentPossession = getCurrentPossession(currentFrame);
  const controlZoneStats = calculateControlZoneStats(currentFrame);
  const momentumStats = calculateMomentumStats(currentFrame);

  return (
    <div style={{ 
      width: "960px", 
      maxWidth: "100%",
      padding: "20px",
      backgroundColor: "#f8f9fa",
      border: "1px solid #dee2e6",
      borderRadius: "8px"
    }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: "600" }}>Match Analytics</h3>
      
      <div>
        <div style={{ marginBottom: "12px" }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "500" }}>Ball Possession</h4>
          <div style={{ 
            display: "flex", 
            height: "30px", 
            borderRadius: "4px", 
            overflow: "hidden",
            border: "1px solid #ccc"
          }}>
            <div style={{
              width: `${stats.team1}%`,
              backgroundColor: TEAM_COLORS[1].stroke,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "12px",
              fontWeight: "600"
            }}>
              {stats.team1 > 10 && `${stats.team1}%`}
            </div>
            <div style={{
              width: `${stats.neutral}%`,
              backgroundColor: "#6b7280",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "12px",
              fontWeight: "600"
            }}>
              {stats.neutral > 10 && `${stats.neutral}%`}
            </div>
            <div style={{
              width: `${stats.team2}%`,
              backgroundColor: TEAM_COLORS[2].stroke,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "12px",
              fontWeight: "600"
            }}>
              {stats.team2 > 10 && `${stats.team2}%`}
            </div>
          </div>
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            marginTop: "8px",
            fontSize: "12px",
            color: "#666"
          }}>
            <span style={{ color: TEAM_COLORS[1].stroke, fontWeight: "600" }}>Team 1: {stats.team1}%</span>
            <span style={{ color: "#6b7280", fontWeight: "600" }}>Neutral: {stats.neutral}%</span>
            <span style={{ color: TEAM_COLORS[2].stroke, fontWeight: "600" }}>Team 2: {stats.team2}%</span>
          </div>
        </div>

        <div style={{ 
          padding: "8px 12px", 
          backgroundColor: currentPossession === 1 ? TEAM_COLORS[1].fill : 
                           currentPossession === 2 ? TEAM_COLORS[2].fill : 
                           "rgba(107, 114, 128, 0.15)",
          borderRadius: "4px",
          fontSize: "14px",
          fontWeight: "500",
          marginBottom: "12px"
        }}>
          Current Possession: {
            currentPossession === 1 ? "Team 1" :
            currentPossession === 2 ? "Team 2" :
            "Neutral"
          }
        </div>

        {controlZoneData && (
          <div style={{ marginBottom: "12px" }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "500" }}>Controlled Zones</h4>
            <div style={{ 
              display: "flex", 
              height: "30px", 
              borderRadius: "4px", 
              overflow: "hidden",
              border: "1px solid #ccc"
            }}>
              <div style={{
                width: `${controlZoneStats.team1}%`,
                backgroundColor: TEAM_COLORS[1].stroke,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "12px",
                fontWeight: "600"
              }}>
                {controlZoneStats.team1 > 10 && `${controlZoneStats.team1}%`}
              </div>
              <div style={{
                width: `${controlZoneStats.team2}%`,
                backgroundColor: TEAM_COLORS[2].stroke,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "12px",
                fontWeight: "600"
              }}>
                {controlZoneStats.team2 > 10 && `${controlZoneStats.team2}%`}
              </div>
            </div>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              marginTop: "8px",
              fontSize: "12px",
              color: "#666"
            }}>
              <span style={{ color: TEAM_COLORS[1].stroke, fontWeight: "600" }}>Team 1: {controlZoneStats.team1}%</span>
              <span style={{ color: TEAM_COLORS[2].stroke, fontWeight: "600" }}>Team 2: {controlZoneStats.team2}%</span>
            </div>
          </div>
        )}

        {momentumData && (
          <div style={{ marginBottom: "12px" }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", fontWeight: "500" }}>Team Momentum</h4>
            <div style={{ display: "flex", gap: "min(10%, 100px)", alignItems: "end", justifyContent: "center" }}>
              {/* Team 1 Bar */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ 
                  width: "max(10%, 50px)", 
                  height: "100px", 
                  backgroundColor: "#f3f4f6", 
                  borderRadius: "4px", 
                  position: "relative",
                  border: "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "end"
                }}>
                  <div style={{
                    width: "100%",
                    height: `${momentumStats.team1}%`,
                    backgroundColor: TEAM_COLORS[1].stroke,
                    borderRadius: "0 0 4px 4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "600",
                    minHeight: "20px"
                  }}>
                    {momentumStats.team1}%
                  </div>
                </div>
                <span style={{ 
                  marginTop: "8px", 
                  fontSize: "12px", 
                  fontWeight: "600", 
                  color: TEAM_COLORS[1].stroke 
                }}>
                  Team 1
                </span>
              </div>

              {/* Team 2 Bar */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ 
                  width: "max(10%, 50px)", 
                  height: "100px", 
                  backgroundColor: "#f3f4f6", 
                  borderRadius: "4px", 
                  position: "relative",
                  border: "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "end"
                }}>
                  <div style={{
                    width: "100%",
                    height: `${momentumStats.team2}%`,
                    backgroundColor: TEAM_COLORS[2].stroke,
                    borderRadius: "0 0 4px 4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "600",
                    minHeight: "20px"
                  }}>
                    {momentumStats.team2}%
                  </div>
                </div>
                <span style={{ 
                  marginTop: "8px", 
                  fontSize: "12px", 
                  fontWeight: "600", 
                  color: TEAM_COLORS[2].stroke 
                }}>
                  Team 2
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
export type { PossessionData, PossessionFrame, ControlZoneData, ControlZoneFrame, MomentumData, MomentumFrame };
