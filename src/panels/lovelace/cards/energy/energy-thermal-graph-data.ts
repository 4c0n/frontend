import type { BarSeriesOption } from "echarts/charts";
import { computeYAxisFractionDigits } from "../../../../components/chart/y-axis-fraction-digits";
import { fillDataGapsAndRoundCaps } from "../../../../components/chart/round-caps";
import type {
  EnergyData,
  ThermalSourceTypeEnergyPreference,
} from "../../../../data/energy";
import { getSuggestedPeriod } from "../../../../data/energy";
import type { Statistics, StatisticsMetaData } from "../../../../data/recorder";
import { getStatisticLabel } from "../../../../data/recorder";
import type { HomeAssistant } from "../../../../types";
import { getEnergyColor } from "./common/color";
import {
  type EnergyDataPoint,
  generateFillBuckets,
  getCompareTransform,
} from "./common/energy-chart-options";

export interface EnergyThermalGraphDataParams {
  hass: HomeAssistant;
  energyData: EnergyData;
  computedStyles: CSSStyleDeclaration;
  /** Current time, injected so the transform is deterministic. */
  now: Date;
}

export interface EnergyThermalGraphData {
  chartData: BarSeriesOption[];
  start: Date;
  end: Date;
  compareStart?: Date;
  compareEnd?: Date;
  unit?: string;
  total?: number;
  yAxisFractionDigits: number;
}

/**
 * Transforms an energy collection update (`EnergyData` + config + environment)
 * into the thermal graph card's chart series and derived state. Pure data
 * processing: every environment read (current time, theme style, hass) is
 * injected so the transform is deterministic and benchmarkable.
 */
export function generateEnergyThermalGraphData(
  params: EnergyThermalGraphDataParams
): EnergyThermalGraphData {
  const { hass, energyData, computedStyles, now } = params;

  const start = energyData.start;
  const end = energyData.end || now;

  const compareStart = energyData.startCompare;
  const compareEnd = energyData.endCompare;

  const thermalSources: ThermalSourceTypeEnergyPreference[] =
    energyData.prefs.energy_sources.filter(
      (source) => source.type === "thermal"
    ) as ThermalSourceTypeEnergyPreference[];

  const unit = energyData.thermalUnit;

  const datasets: BarSeriesOption[] = [];

  let yMin = Infinity;
  let yMax = -Infinity;
  const trackY = (v: number) => {
    if (v < yMin) yMin = v;
    if (v > yMax) yMax = v;
  };

  // `compareTransform` and `period` depend only on start/end/compareStart,
  // which are identical for both the compare and main passes. Compute them
  // once here instead of recomputing (and re-allocating the transform
  // closure) inside each processDataSet call.
  const compareTransform = getCompareTransform(start, compareStart!);
  const period = getSuggestedPeriod(start, end);

  if (energyData.statsCompare) {
    datasets.push(
      ...processDataSet(
        hass,
        compareTransform,
        period,
        energyData.statsCompare,
        energyData.statsMetadata,
        thermalSources,
        computedStyles,
        trackY,
        true
      )
    );
  } else {
    // add empty dataset so compare bars are first
    // `stack: thermal` so it doesn't take up space yet
    const firstId = thermalSources[0]?.stat_energy_from ?? "placeholder";
    datasets.push({
      id: "compare-" + firstId,
      type: "bar",
      stack: "thermal",
      data: [],
    });
  }

  datasets.push(
    ...processDataSet(
      hass,
      compareTransform,
      period,
      energyData.stats,
      energyData.statsMetadata,
      thermalSources,
      computedStyles,
      trackY
    )
  );

  fillDataGapsAndRoundCaps(
    datasets,
    true,
    generateFillBuckets(datasets, start, end, period)
  );
  const yAxisFractionDigits = computeYAxisFractionDigits(yMin, yMax, true);
  const chartData = datasets;
  const total = processTotal(energyData.stats, thermalSources);

  return {
    chartData,
    start,
    end,
    compareStart,
    compareEnd,
    unit,
    total,
    yAxisFractionDigits,
  };
}

function processTotal(
  statistics: Statistics,
  thermalSources: ThermalSourceTypeEnergyPreference[]
) {
  return thermalSources.reduce(
    (sum, source) =>
      sum +
      (source.stat_energy_from in statistics
        ? statistics[source.stat_energy_from].reduce(
            (acc, curr) => acc + (curr.change || 0),
            0
          )
        : 0),
    0
  );
}

function processDataSet(
  hass: HomeAssistant,
  compareTransform: (ts: Date) => Date,
  period: ReturnType<typeof getSuggestedPeriod>,
  statistics: Statistics,
  statisticsMetaData: Record<string, StatisticsMetaData>,
  thermalSources: ThermalSourceTypeEnergyPreference[],
  computedStyles: CSSStyleDeclaration,
  trackY: (v: number) => void,
  compare = false
) {
  const data: BarSeriesOption[] = [];

  // `center` (sub-daily midpoint) and the active compare transform depend only
  // on the call-level `period`/`compare` args, so they are loop-invariant.
  // Hoist them once and inline computeStatMidpoint below, choosing the branch
  // from these two booleans, to avoid a per-point function call, a per-point
  // `center` recompute and a per-point `compare ? … : undefined` ternary in the
  // hottest loop. The arithmetic and addition order are kept identical so the
  // resulting timestamps are bit-identical to computeStatMidpoint.
  const center = period === "hour" || period === "5minute";
  const transform = compare ? compareTransform : undefined;

  thermalSources.forEach((source, idx) => {
    const statId = source.stat_energy_from;
    let prevStart: number | null = null;

    const thermalConsumptionData: BarSeriesOption["data"] = [];

    // Process thermal consumption data.
    if (statId in statistics) {
      const stats = statistics[statId];
      for (const point of stats) {
        const change = point.change;
        if (change === null || change === undefined || change === 0) {
          continue;
        }
        const pointStart = point.start;
        if (prevStart === pointStart) {
          continue;
        }
        let midpoint: number;
        if (center) {
          midpoint = transform
            ? (transform(new Date(pointStart)).getTime() +
                transform(new Date(point.end)).getTime()) /
              2
            : (pointStart + point.end) / 2;
        } else {
          midpoint = transform
            ? transform(new Date(pointStart)).getTime()
            : pointStart;
        }
        const dataPoint: EnergyDataPoint = [midpoint, change, pointStart];
        thermalConsumptionData.push(dataPoint);
        trackY(change);
        prevStart = pointStart;
      }
    }

    data.push({
      type: "bar",
      cursor: "default",
      id: compare ? "compare-" + statId : statId,
      name:
        source.name ||
        getStatisticLabel(hass, statId, statisticsMetaData[statId]),
      barMaxWidth: 50,
      itemStyle: {
        borderColor: getEnergyColor(
          computedStyles,
          hass.themes.darkMode,
          false,
          compare,
          "--energy-thermal-color",
          idx
        ),
      },
      color: getEnergyColor(
        computedStyles,
        hass.themes.darkMode,
        true,
        compare,
        "--energy-thermal-color",
        idx
      ),
      data: thermalConsumptionData,
      stack: compare ? "compare-thermal" : "thermal",
    });
  });
  return data;
}
