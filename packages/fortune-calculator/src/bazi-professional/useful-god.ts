import type { BaziEnrichment } from "../bazi-enrich/enrich.js"
import {
  GAN_WUXING,
  ZHI_CANG_GAN,
  getShiShen,
  type Dizhi,
  type Tiangan,
  type WuXing,
} from "../bazi-enrich/tables.js"

type Pillar = "年" | "月" | "日" | "时"
type SiZhu = Record<Pillar, { gan: Tiangan; zhi: Dizhi }>
type Confidence = "高" | "中" | "低"

export type UsefulGodMethod = {
  type: string
  priority: number
  conclusion: WuXing[]
  evidence: string[]
}

export type UsefulGodAnalysis = {
  primary: WuXing[]
  favorable: WuXing[]
  unfavorable: WuXing[]
  stemCandidates: Tiangan[]
  methods: UsefulGodMethod[]
  confidence: Confidence
  caveats: string[]
}

const ELEMENTS: WuXing[] = ["木", "火", "土", "金", "水"]
const PRODUCES: Record<WuXing, WuXing> = {
  木: "火", 火: "土", 土: "金", 金: "水", 水: "木",
}
const CONTROLS: Record<WuXing, WuXing> = {
  木: "土", 火: "金", 土: "水", 金: "木", 水: "火",
}
const STEMS: Record<WuXing, Tiangan[]> = {
  木: ["甲", "乙"],
  火: ["丙", "丁"],
  土: ["戊", "己"],
  金: ["庚", "辛"],
  水: ["壬", "癸"],
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function producerOf(element: WuXing): WuXing {
  return ELEMENTS.find((candidate) => PRODUCES[candidate] === element)!
}

function controllerOf(element: WuXing): WuXing {
  return ELEMENTS.find((candidate) => CONTROLS[candidate] === element)!
}

function monthPatternCandidates(dayElement: WuXing, pattern: string): WuXing[] {
  const resource = producerOf(dayElement)
  const output = PRODUCES[dayElement]
  const wealth = CONTROLS[dayElement]
  const officer = controllerOf(dayElement)
  if (pattern.includes("七杀") || pattern.includes("正官")) return [resource, output]
  if (pattern.includes("正财") || pattern.includes("偏财")) return [resource, dayElement]
  if (pattern.includes("正印") || pattern.includes("偏印")) return [wealth, dayElement]
  if (pattern.includes("食神") || pattern.includes("伤官")) return [resource, officer]
  if (pattern.includes("比肩") || pattern.includes("劫财")) return [officer, wealth]
  return [resource, output]
}

function hasStrongSevenKillings(siZhu: SiZhu): boolean {
  const dayMaster = siZhu.日.gan
  const monthMain = ZHI_CANG_GAN[siZhu.月.zhi][0]?.gan
  if (monthMain && getShiShen(dayMaster, monthMain) === "七杀") return true
  const killingStems = (Object.keys(siZhu) as Pillar[])
    .filter((pillar) => getShiShen(dayMaster, siZhu[pillar].gan) === "七杀")
  if (killingStems.length === 0) return false
  return (Object.keys(siZhu) as Pillar[]).some((pillar) => {
    const main = ZHI_CANG_GAN[siZhu[pillar].zhi][0]?.gan
    return main ? getShiShen(dayMaster, main) === "七杀" : false
  })
}

export function analyzeUsefulGod(
  siZhu: SiZhu,
  enrichment: BaziEnrichment,
): UsefulGodAnalysis {
  const methods: UsefulGodMethod[] = []
  const caveats: string[] = []
  const dayElement = GAN_WUXING[siZhu.日.gan]
  const monthBranch = siZhu.月.zhi
  const strongSevenKillings = hasStrongSevenKillings(siZhu)

  if (strongSevenKillings) {
    methods.push({
      type: "强七杀",
      priority: 110,
      conclusion: [producerOf(dayElement), PRODUCES[dayElement]],
      evidence: ["七杀当令，或七杀透干且地支见本气根", "先取印化杀，再参考食伤制杀"],
    })
  }

  if (["亥", "子", "丑"].includes(monthBranch)) {
    methods.push({
      type: "调候",
      priority: 100,
      conclusion: ["火"],
      evidence: [`月令${monthBranch}属冬令，原局先处理寒重`],
    })
  } else if (["巳", "午", "未"].includes(monthBranch)) {
    methods.push({
      type: "调候",
      priority: 100,
      conclusion: ["水"],
      evidence: [`月令${monthBranch}属夏令，原局先处理燥热`],
    })
  }

  methods.push({
    type: "月令格局",
    priority: 80,
    conclusion: monthPatternCandidates(dayElement, enrichment.格局.primary),
    evidence: [enrichment.格局.basis, `以${enrichment.格局.primary}处理月令主要矛盾`],
  })

  const strongest = enrichment.五行统计.strongest as WuXing[]
  if (strongest.length > 0) {
    methods.push({
      type: "制化旺神",
      priority: 60,
      conclusion: unique(strongest.flatMap((element) => [controllerOf(element), PRODUCES[element]])),
      evidence: [`表层五行以${strongest.join("、")}最旺`, "取能制约或泄化旺神的五行"],
    })
  }

  methods.sort((left, right) => right.priority - left.priority)
  const highest = methods[0]?.priority ?? 0
  const priorityCandidates = unique(
    methods
      .filter((method) => highest - method.priority <= 20)
      .flatMap((method) => method.conclusion),
  )
  const climateMethod = methods.find((method) => method.type === "调候")
  const primary = unique([
    ...(climateMethod?.conclusion ?? []),
    ...priorityCandidates,
  ])
  const favorable = unique(
    methods.flatMap((method) => method.conclusion).filter((element) => !primary.includes(element)),
  )
  const climateUnfavorable: WuXing[] = ["亥", "子", "丑"].includes(monthBranch)
    ? ["水" as WuXing]
    : ["巳", "午", "未"].includes(monthBranch)
      ? ["火" as WuXing]
      : []
  const unresolvedStrongest = strongest.filter(
    (element) => !primary.some((candidate) => CONTROLS[candidate] === element),
  )
  const unfavorable = unique([...climateUnfavorable, ...unresolvedStrongest])

  const topMethods = methods.filter((method) => highest - method.priority <= 20)
  const competing = unique(topMethods.flatMap((method) => method.conclusion)).length > 1
  if (competing) caveats.push("高优先级证据存在多个取用方向，应结合原局透藏、有根与受损状态复核")
  if (enrichment.格局.notes.some((note) => note.includes("从"))) {
    caveats.push("格局存在从格边界，暂不按单一扶抑法定唯一用神")
  }
  const confidence: Confidence = caveats.length > 0
    ? "中"
    : highest >= 100 && topMethods.every((method) => method.conclusion[0] === primary[0])
      ? "高"
      : "中"

  return {
    primary,
    favorable,
    unfavorable,
    stemCandidates: unique(primary.flatMap((element) => STEMS[element])),
    methods,
    confidence,
    caveats,
  }
}
