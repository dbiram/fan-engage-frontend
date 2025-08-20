import { useEffect, useState } from "react";

type Match = { id:number; title:string; video_url:string };

export default function Home() {
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    fetch(process.env.NEXT_PUBLIC_API_BASE + "/matches")
      .then(r => r.json())
      .then(setMatches)
      .catch(console.error);
  }, []);
  return (
    <main style={{padding:20}}>
      <h1>Matches</h1>
      <ul>
        {matches.map(m => (
          <li key={m.id}>
            <a href={`/match/${m.id}`}>{m.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
