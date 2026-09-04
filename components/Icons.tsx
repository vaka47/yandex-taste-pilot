import type { SVGProps } from "react";

type IconName = "arrow" | "check" | "clock" | "comment" | "copy" | "eye" | "eyeOff" | "heart" | "home" | "lock" | "music" | "pause" | "play" | "playlist" | "pulse" | "search" | "send" | "settings" | "share" | "shield" | "spark" | "sync" | "user" | "userOff" | "users" | "x";

export function Icon({ name, size = 20, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    comment: <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.7 9.7 0 0 1-4.1-.9L3 21l1.5-4.3A8.6 8.6 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/><path d="M8 10.5h8M8 14h5"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    eyeOff: <><path d="M3 3l18 18"/><path d="M10.6 6.2A9.5 9.5 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.2 2.9M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6a9 9 0 0 0 3-.5"/><path d="M10.4 10.4a2.5 2.5 0 0 0 3.2 3.2"/></>,
    heart: <path d="M20.8 5.8a5 5 0 0 0-7.1 0L12 7.5l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21l8.8-8.1a5 5 0 0 0 0-7.1Z"/>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    music: <><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>,
    pause: <><path d="M9 5v14M15 5v14"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    playlist: <><path d="M4 6h10M4 11h10M4 16h6"/><path d="M18 10v8"/><circle cx="15" cy="18" r="3"/></>,
    pulse: <path d="M2 12h4l2.5-6 5 12 2.5-6h6"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></>,
    send: <><path d="m21 3-7.7 18-4.2-7.7L2 9.2 21 3Z"/><path d="m9.1 13.3 5.2-4.8"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.8-1.9l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.9-.8L10.5 2h-3l-.7 2a7 7 0 0 0-1.9.8L3 3.9.9 6l.9 1.9a7 7 0 0 0-.8 1.9l-2 .7v3l2 .7a7 7 0 0 0 .8 1.9L.9 18 3 20.1l1.9-.9a7 7 0 0 0 1.9.8l.7 2h3l.7-2a7 7 0 0 0 1.9-.8l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .8-1.9l2-.7Z" transform="translate(3) scale(.75)"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.5 10.5 7-4M8.5 13.5l7 4"/></>,
    shield: <><path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
    spark: <><path d="M12 2c.6 5.2 3.8 8.4 9 9-5.2.6-8.4 3.8-9 9-.6-5.2-3.8-8.4-9-9 5.2-.6 8.4-3.8 9-9Z"/><path d="M19 2v4M17 4h4"/></>,
    sync: <><path d="M20 7h-5V2"/><path d="M20 7a9 9 0 1 0 1 8"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    userOff: <><circle cx="12" cy="8" r="4"/><path d="M5 20c.8-3.5 3.3-5.5 7-5.5 2.1 0 3.9.6 5.1 1.8"/><path d="M3 3l18 18"/></>,
    users: <><path d="M16 21a7 7 0 0 0-14 0"/><circle cx="9" cy="8" r="4"/><path d="M17 11a4 4 0 0 0 0-8M22 21a7 7 0 0 0-5-6.7"/></>,
    x: <path d="m6 6 12 12M18 6 6 18"/>
  };
  return <svg {...common} {...props}>{paths[name]}</svg>;
}
