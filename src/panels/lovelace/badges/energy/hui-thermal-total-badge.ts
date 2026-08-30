import { consume } from "@lit/context";
import type { ContextType } from "@lit/context";
import { mdiHeatingCoil } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatNumber } from "../../../../common/number/format_number";
import "../../../../components/ha-badge";
import "../../../../components/ha-svg-icon";
import {
  internationalizationContext,
  statesContext,
} from "../../../../data/context";
import type { EnergyData, EnergyPreferences } from "../../../../data/energy";
import { getEnergyDataCollection } from "../../../../data/energy";
import { SubscribeMixin } from "../../../../mixins/subscribe-mixin";
import type {
  HomeAssistant,
  HomeAssistantInternationalization,
} from "../../../../types";
import type { LovelaceBadge } from "../../types";

@customElement("hui-thermal-total-badge")
export class HuiThermalTotalBadge
  extends SubscribeMixin(LitElement)
  implements LovelaceBadge
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: ContextType<typeof statesContext>;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: HomeAssistantInternationalization;

  @state() private _config?: ThermalTotalBadgeConfig;

  @state() private _data?: EnergyData;

  private _entities = new Set<string>();

  protected hassSubscribeRequiredHostProps = ["_config"];

  public setConfig(config: ThermalTotalBadgeConfig): void {
    this._config = config;
  }

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      getEnergyDataCollection(this.hass, {
        key: this._config?.collection_key,
      }).subscribe((data) => {
        this._data = data;
      }),
    ];
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (changedProps.has("_config") || changedProps.has("_data")) {
      return true;
    }

    if (changedProps.has("_states")) {
      const oldStates = changedProps.get("_states") as
        ContextType<typeof statesContext> | undefined;
      if (!oldStates || !this._entities.size) {
        return true;
      }

      for (const entityId of this._entities) {
        if (oldStates[entityId] !== this._states?.[entityId]) {
          return true;
        }
      }
    }

    return false;
  }

  private _getCurrentThermalEnergy(entityId: string): number {
    this._entities.add(entityId);
    return parseFloat(this._states[entityId].state) ?? 0;
  }

  private _computeTotalThermalEnergy(prefs: EnergyPreferences): number {
    this._entities.clear();

    let total = 0;

    prefs.energy_sources.forEach((source) => {
      if (source.type === "thermal" && source.stat_rate) {
        const value = this._getCurrentThermalEnergy(source.stat_rate);
        if (value > 0) total += value;
      }
    });

    return Math.max(0, total);
  }

  protected render() {
    if (!this._config || !this._data || !this._i18n) {
      return nothing;
    }

    const thermalEnergy = this._computeTotalThermalEnergy(this._data.prefs);

    const displayValue = `${formatNumber(thermalEnergy, this._i18n.locale, {
      maximumFractionDigits: 3,
    })}`;

    const name =
      this._config.title ||
      this._i18n.localize("ui.panel.lovelace.cards.energy.thermal_total_title");

    return html`
      <ha-badge .label=${name}>
        <ha-svg-icon slot="icon" .path=${mdiHeatingCoil}></ha-svg-icon>
        ${displayValue} GJ
      </ha-badge>
    `;
  }

  static styles = css`
    ha-badge {
      --badge-color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-thermal-total-badge": HuiThermalTotalBadge;
  }
}
