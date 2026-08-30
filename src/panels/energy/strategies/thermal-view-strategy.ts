import { ReactiveElement } from "lit";
import { customElement } from "lit/decorators";
import {
  DEFAULT_ENERGY_COLLECTION_KEY,
  getEnergyDataCollection,
} from "../../../data/energy";
import type { HomeAssistant } from "../../../types";
import type { LovelaceViewConfig } from "../../../data/lovelace/config/view";
import type { EnergyViewStrategyConfig } from "./energy-cards";
import { hasThermalSource, isEnergyCardVisible } from "./energy-cards";
import type { LovelaceSectionConfig } from "../../../data/lovelace/config/section";
import type { LovelaceStrategyDependency } from "../../lovelace/strategies/types";

@customElement("thermal-view-strategy")
export class ThermalViewStrategy extends ReactiveElement {
  static registryDependencies: readonly LovelaceStrategyDependency[] = [];

  static async generate(
    _config: EnergyViewStrategyConfig,
    hass: HomeAssistant
  ): Promise<LovelaceViewConfig> {
    const collectionKey =
      _config.collection_key || DEFAULT_ENERGY_COLLECTION_KEY;
    const hidden = _config.hidden_cards;

    const view: LovelaceViewConfig = {
      type: "sections",
      max_columns: 3,
      sections: [{ type: "grid", cards: [], column_span: 3 }],
      footer: {
        card: {
          type: "energy-date-selection",
          collection_key: collectionKey,
          opening_direction: "right",
          vertical_opening_direction: "up",
        },
      },
    };

    const energyCollection = getEnergyDataCollection(hass, {
      key: collectionKey,
    });
    if (!energyCollection.prefs) {
      await energyCollection.refresh();
    }
    const prefs = energyCollection.prefs;

    // No thermal sources available
    if (!prefs || !hasThermalSource(prefs)) {
      return view;
    }

    const section = view.sections![0] as LovelaceSectionConfig;

    section.cards!.push({
      type: "energy-compare",
      collection_key: collectionKey,
      grid_options: {
        columns: 36,
      },
    });

    if (isEnergyCardVisible("thermal", "energy-thermal-graph", prefs, hidden)) {
      section.cards!.push({
        title: hass.localize(
          "ui.panel.energy.cards.energy_thermal_graph_title"
        ),
        type: "energy-thermal-graph",
        collection_key: collectionKey,
        grid_options: {
          columns: 24,
        },
      });
    }

    if (isEnergyCardVisible("thermal", "energy-sources-table", prefs, hidden)) {
      section.cards!.push({
        title: hass.localize(
          "ui.panel.energy.cards.energy_sources_table_title"
        ),
        type: "energy-sources-table",
        collection_key: collectionKey,
        types: ["thermal"],
        grid_options: {
          columns: 12,
        },
      });
    }

    return view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "thermal-view-strategy": ThermalViewStrategy;
  }
}
