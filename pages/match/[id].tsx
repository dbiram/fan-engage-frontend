import { useRouter } from "next/router";
import { useEffect, useState } from "react";

type Match = { id:number; title:string; video_url:string };

export default function MatchPage() {
  const router = useRouter();
  const { id } = router.query;
  const [match, setMatch] = useState<Match | null>(null);
  useEffect(() => {
    if (!id) return;
    fetch(process.env.NEXT_PUBLIC_API_BASE + "/matches")
      .then(r => r.json())
      .then((rows: Match[]) => {
        const m = rows.find(x => x.id === Number(id));
        if (m) {
            setMatch(m);
        }
      });
  }, [id]);

  if (!match) return <div style={{padding:20}}>Loading…</div>;

  return (
    <main style={{padding:20}}>
      <h2>{match.title}</h2>
      <video controls width={960} src={match.video_url} />
      <p style={{opacity:.7}}>Phase 1 placeholder timeline…</p>
    </main>
  );
}
