import { WorkReportChecklist } from "../models/WorkReportChecklist";

export function calcMoldIndex(c: WorkReportChecklist) {
  const moldVisual = c.moldVisual === "SEVERE" ? 35 : c.moldVisual === "SOME" ? 18 : 0;
  const unitMold = c.unitMold === "SEVERE" ? 30 : c.unitMold === "MID" ? 15 : 0;
  const moldTrace = c.moldTrace === "WIDE" ? 25 : c.moldTrace === "PARTIAL" ? 12 : 0;
  const leak = c.leakTrace ? 10 : 0;
  return Math.min(100, moldVisual + unitMold + moldTrace + leak);
}

export function calcSoilIndex(c: WorkReportChecklist) {
  const exterior = c.exteriorSoil === "HEAVY" ? 30 : c.exteriorSoil === "MEDIUM" ? 15 : 5;
  const eva = c.evaSoil === "HEAVY" ? 40 : c.evaSoil === "MEDIUM" ? 20 : 8;
  const slime = c.slime ? 15 : 0;
  const odor = c.odor ? 10 : 0;
  return Math.min(100, exterior + eva + slime + odor);
}
