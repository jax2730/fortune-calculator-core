import { describe, expect, it } from "vitest"

import { enrichBazi } from "../src/bazi-enrich/enrich"
import { analyzeUsefulGod } from "../src/bazi-professional/useful-god"
import type { Dizhi, Tiangan } from "../src/bazi-enrich/tables"

type Pillar = "年" | "月" | "日" | "时"
type Chart = Record<Pillar, { gan: Tiangan; zhi: Dizhi }>

function analyze(siZhu: Chart) {
  return analyzeUsefulGod(siZhu, enrichBazi(siZhu))
}

describe("Bazi useful-god analysis", () => {
  it("prioritizes fire for a cold winter chart", () => {
    const result = analyze({
      年: { gan: "壬", zhi: "子" },
      月: { gan: "癸", zhi: "子" },
      日: { gan: "甲", zhi: "寅" },
      时: { gan: "癸", zhi: "亥" },
    })

    expect(result.primary[0]).toBe("火")
    expect(result.methods[0]).toMatchObject({ type: "调候", priority: 100 })
    expect(result.unfavorable).toContain("水")
  })

  it("prioritizes water for a dry summer chart", () => {
    const result = analyze({
      年: { gan: "丙", zhi: "午" },
      月: { gan: "丁", zhi: "午" },
      日: { gan: "庚", zhi: "申" },
      时: { gan: "丙", zhi: "巳" },
    })

    expect(result.primary[0]).toBe("水")
    expect(result.methods.some((method) => method.type === "调候")).toBe(true)
    expect(result.unfavorable).toContain("火")
  })

  it("places strong Seven Killings before ordinary month-pattern balancing", () => {
    const result = analyze({
      年: { gan: "庚", zhi: "申" },
      月: { gan: "庚", zhi: "申" },
      日: { gan: "甲", zhi: "寅" },
      时: { gan: "壬", zhi: "子" },
    })

    expect(result.methods[0].type).toBe("强七杀")
    expect(result.methods[0].evidence.join(" ")).toContain("七杀")
    expect(result.primary).toContain("水")
  })

  it("keeps multiple candidates and lowers confidence when evidence conflicts", () => {
    const result = analyze({
      年: { gan: "丙", zhi: "午" },
      月: { gan: "丁", zhi: "午" },
      日: { gan: "壬", zhi: "子" },
      时: { gan: "庚", zhi: "申" },
    })

    expect(result.primary.length).toBeGreaterThan(1)
    expect(result.confidence).not.toBe("高")
    expect(result.caveats.length).toBeGreaterThan(0)
  })
})
