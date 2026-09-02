import type { TastemakerGender } from "@/types/domain";

export function listenedVerb(gender: TastemakerGender) {
  if (gender === "female") return "послушала";
  if (gender === "male") return "послушал";
  return "слушает";
}

export function commentedVerb(gender: TastemakerGender) {
  if (gender === "female") return "прокомментировала";
  if (gender === "male") return "прокомментировал";
  return "комментирует";
}

export function newMusicHeading(name: string, gender: TastemakerGender) {
  return gender === "neutral" ? `${name}: новое в истории` : `${name} ${listenedVerb(gender)} новое`;
}
