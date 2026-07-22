import { astro } from "iztro"

import type { BirthInfo } from "../yiqi-core/types.js"

export type ZiweiAnnualEntry = {
  age: number
  year: number
  available: boolean
  palaceIndex?: number
  palaceName?: string
  heavenlyStem?: string
  earthlyBranch?: string
  transformations?: Array<{ type: "禄" | "权" | "科" | "忌"; star: string }>
  palaceMappings?: Array<{ natalIndex: number; annualPalaceName: string }>
  dynamicStars?: Array<{ palaceIndex: number; name: string; type?: string }>
  error?: string
}

function hourToTimeIndex(hour: number): number {
  if (hour >= 23 || hour < 1) return 0
  return Math.floor((hour + 1) / 2)
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0")
}

export function buildZiweiAnnualTimeline(birth: BirthInfo): ZiweiAnnualEntry[] {
  let chart: ReturnType<typeof astro.bySolar>
  try {
    chart = astro.bySolar(
      `${birth.year}-${twoDigits(birth.month)}-${twoDigits(birth.day)}`,
      hourToTimeIndex(birth.hour),
      birth.gender === "male" ? "男" : "女",
      true,
      "zh-CN",
    )
  } catch (error) {
    return unavailableTimeline(birth.year, error)
  }

  return Array.from({ length: 65 }, (_, index) => {
    const age = index + 1
    const year = birth.year + index
    try {
      // Mid-year avoids mapping January to the previous lunar year.
      const yearly = chart.horoscope(`${year}-07-01`).yearly
      if (!yearly) throw new Error("iztro did not return yearly dynamics")
      const palaceMappings = (yearly.palaceNames ?? []).map((annualPalaceName, natalIndex) => ({
        natalIndex,
        annualPalaceName,
      }))
      const dynamicStars = (yearly.stars ?? []).flatMap((stars, palaceIndex) =>
        (stars ?? []).map((star) => ({
          palaceIndex,
          name: star.name,
          type: star.type,
        })),
      )
      const transformationTypes = ["禄", "权", "科", "忌"] as const
      const transformations = (yearly.mutagen ?? []).map((star, mutationIndex) => ({
        type: transformationTypes[mutationIndex],
        star,
      }))

      return {
        age,
        year,
        available: true,
        palaceIndex: yearly.index,
        palaceName: yearly.palaceNames?.[yearly.index] ?? yearly.name ?? "流年",
        heavenlyStem: yearly.heavenlyStem,
        earthlyBranch: yearly.earthlyBranch,
        transformations,
        palaceMappings,
        dynamicStars,
      }
    } catch (error) {
      return unavailableEntry(age, year, error)
    }
  })
}

function unavailableTimeline(birthYear: number, error: unknown): ZiweiAnnualEntry[] {
  return Array.from({ length: 65 }, (_, index) =>
    unavailableEntry(index + 1, birthYear + index, error),
  )
}

function unavailableEntry(age: number, year: number, error: unknown): ZiweiAnnualEntry {
  return {
    age,
    year,
    available: false,
    error: error instanceof Error ? error.message : String(error),
  }
}
