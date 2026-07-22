import type { DayunDetail, GanZhi, SiZhu } from "../yiqi-core/types.js"
import {
  DIZHI,
  GAN_WUXING,
  TIANGAN,
  ZHI_CANG_GAN,
  getShiShen,
  shengKe,
  type Dizhi,
  type Tiangan,
  type WuXing,
} from "../bazi-enrich/tables.js"
import type { UsefulGodAnalysis } from "./useful-god.js"

export type AnnualRelation = {
  scope: "原局" | "大运"
  target: string
  type: string
  detail: string
}

export type BaziAnnualEntry = {
  age: number
  year: number
  ganZhi: GanZhi
  activeDayun: Pick<DayunDetail, "ganZhi" | "startAge" | "startYear" | "endYear"> | null
  stemTenGod: string
  branchTenGod: string
  natalRelations: AnnualRelation[]
  dayunRelations: AnnualRelation[]
  tags: string[]
  theme: string
  confidence: "高" | "中" | "低"
}

const GAN_HE = new Set(["甲己", "己甲", "乙庚", "庚乙", "丙辛", "辛丙", "丁壬", "壬丁", "戊癸", "癸戊"])
const ZHI_CHONG = new Set(["子午", "午子", "丑未", "未丑", "寅申", "申寅", "卯酉", "酉卯", "辰戌", "戌辰", "巳亥", "亥巳"])
const ZHI_HE = new Set(["子丑", "丑子", "寅亥", "亥寅", "卯戌", "戌卯", "辰酉", "酉辰", "巳申", "申巳", "午未", "未午"])
const ZHI_HAI = new Set(["子未", "未子", "丑午", "午丑", "寅巳", "巳寅", "卯辰", "辰卯", "申亥", "亥申", "酉戌", "戌酉"])

function annualGanZhi(year: number): GanZhi {
  const offset = ((year - 1984) % 60 + 60) % 60
  return {
    gan: TIANGAN[offset % 10] as GanZhi["gan"],
    zhi: DIZHI[offset % 12] as GanZhi["zhi"],
  }
}

function pairRelations(
  annual: GanZhi,
  target: GanZhi,
  scope: AnnualRelation["scope"],
  label: string,
): AnnualRelation[] {
  const relations: AnnualRelation[] = []
  if (GAN_HE.has(`${annual.gan}${target.gan}`)) {
    relations.push({ scope, target: label, type: "天干合", detail: `${annual.gan}${target.gan}合` })
  } else {
    const relation = shengKe(GAN_WUXING[annual.gan as Tiangan], GAN_WUXING[target.gan as Tiangan])
    if (relation === "克" || relation === "被克") {
      relations.push({ scope, target: label, type: "天干相克", detail: `${annual.gan}${target.gan}相克` })
    }
  }
  const branchPair = `${annual.zhi}${target.zhi}`
  if (ZHI_CHONG.has(branchPair)) relations.push({ scope, target: label, type: "六冲", detail: `${branchPair}冲` })
  if (ZHI_HE.has(branchPair)) relations.push({ scope, target: label, type: "六合", detail: `${branchPair}合` })
  if (ZHI_HAI.has(branchPair)) relations.push({ scope, target: label, type: "六害", detail: `${branchPair}害` })
  if (annual.zhi === target.zhi && ["辰", "午", "酉", "亥"].includes(annual.zhi)) {
    relations.push({ scope, target: label, type: "自刑", detail: `${annual.zhi}${target.zhi}自刑` })
  }
  return relations
}

function elementTags(annual: GanZhi, usefulGod: UsefulGodAnalysis): string[] {
  const elements = new Set<WuXing>([
    GAN_WUXING[annual.gan as Tiangan],
    GAN_WUXING[ZHI_CANG_GAN[annual.zhi as Dizhi][0].gan],
  ])
  const tags: string[] = []
  if (usefulGod.primary.some((element) => elements.has(element))) tags.push("用神到位")
  if (usefulGod.favorable.some((element) => elements.has(element))) tags.push("喜神助力")
  if (usefulGod.unfavorable.some((element) => elements.has(element))) tags.push("忌神增力")
  return tags.length > 0 ? tags : ["五行平常"]
}

export function buildBaziAnnualTimeline(input: {
  birthYear: number
  siZhu: SiZhu
  dayun: DayunDetail[]
  usefulGod: UsefulGodAnalysis
}): BaziAnnualEntry[] {
  const existingByAge = new Map(
    input.dayun.flatMap((period) => period.liuNian).map((entry) => [entry.age, entry]),
  )
  const natalPillars = Object.entries(input.siZhu) as Array<[string, GanZhi]>

  return Array.from({ length: 65 }, (_, index) => {
    const age = index + 1
    const year = input.birthYear + index
    const existing = existingByAge.get(age)
    const ganZhi = existing?.ganZhi ?? annualGanZhi(year)
    const active = input.dayun.find((period) => year >= period.startYear && year <= period.endYear) ?? null
    const natalRelations = natalPillars.flatMap(([label, pillar]) =>
      pairRelations(ganZhi, pillar, "原局", label),
    )
    const dayunRelations = active ? pairRelations(ganZhi, active.ganZhi, "大运", "大运") : []
    const tags = elementTags(ganZhi, input.usefulGod)
    const favorable = tags.includes("用神到位") || tags.includes("喜神助力")
    const unfavorable = tags.includes("忌神增力")
    const theme = favorable && !unfavorable
      ? "运年对原局有补益，宜把握可验证的成长与推进机会"
      : unfavorable && !favorable
        ? "运年放大原局压力，宜控制风险、作息与重大决策节奏"
        : "喜忌并见，先看大运承载，再以实际事件校验取舍"

    return {
      age,
      year,
      ganZhi,
      activeDayun: active ? {
        ganZhi: active.ganZhi,
        startAge: active.startAge,
        startYear: active.startYear,
        endYear: active.endYear,
      } : null,
      stemTenGod: getShiShen(input.siZhu.day.gan as Tiangan, ganZhi.gan as Tiangan),
      branchTenGod: getShiShen(
        input.siZhu.day.gan as Tiangan,
        ZHI_CANG_GAN[ganZhi.zhi as Dizhi][0].gan,
      ),
      natalRelations,
      dayunRelations,
      tags,
      theme,
      confidence: usefulGodConfidence(input.usefulGod, natalRelations, dayunRelations),
    }
  })
}

function usefulGodConfidence(
  usefulGod: UsefulGodAnalysis,
  natalRelations: AnnualRelation[],
  dayunRelations: AnnualRelation[],
): BaziAnnualEntry["confidence"] {
  if (usefulGod.confidence === "低") return "低"
  if (usefulGod.caveats.length > 0 || natalRelations.length + dayunRelations.length >= 5) return "中"
  return usefulGod.confidence
}
