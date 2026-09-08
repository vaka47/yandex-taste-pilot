import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { appUrl } from "@/lib/server/config";
import { getPublicProfile } from "@/lib/server/repository";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await getPublicProfile(slug === "pilot-author" ? "safonov-ivan" : slug, null);
  if (!profile) notFound();
  const avatar = profile.avatarUrl ? (profile.avatarUrl.startsWith("http") ? profile.avatarUrl : `${appUrl()}${profile.avatarUrl}`) : null;
  const latest = profile.events[0];
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#ee5f38", color: "#11110f", padding: 52, fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: 526, height: 526, display: "flex", border: "3px solid #11110f", background: "#ffcf21", boxShadow: "14px 14px 0 rgba(17,17,15,.2)" }}>
        {avatar ? <img src={avatar} alt="" width="526" height="526" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 132, fontWeight: 900 }}>{profile.name.split(" ").map(word => word[0]).join("").slice(0, 2)}</div>}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 0 18px 68px" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, fontWeight: 800 }}>●&nbsp;&nbsp;Taste</div>
        <div style={{ marginTop: 66, fontSize: 24, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Что слушает</div>
        <div style={{ marginTop: 12, fontSize: 76, lineHeight: .92, fontWeight: 900, textTransform: "uppercase" }}>{profile.name}</div>
        <div style={{ marginTop: 24, color: "#fffef9", fontSize: 27, lineHeight: 1.25 }}>{profile.roleLine}</div>
        <div style={{ marginTop: "auto", paddingTop: 26, borderTop: "2px solid rgba(17,17,15,.65)", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 18, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5 }}>Сейчас в истории</div>
          <div style={{ marginTop: 8, color: "#fffef9", fontSize: 26, fontWeight: 700 }}>{latest ? `${latest.track.title} — ${latest.track.artists.join(", ")}` : "Первая музыка скоро появится"}</div>
        </div>
      </div>
    </div>,
    size
  );
}
