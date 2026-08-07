import { mdiDelete, mdiHeatingCoil, mdiPencil, mdiPlus } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import "../../../../components/ha-icon-button";
import type {
  EnergyPreferences,
  EnergyPreferencesValidation,
  EnergyValidationIssue,
  ThermalSourceTypeEnergyPreference,
} from "../../../../data/energy";
import { saveEnergyPreferences } from "../../../../data/energy";
import type { StatisticsMetaData } from "../../../../data/recorder";
import { getStatisticLabel } from "../../../../data/recorder";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { documentationUrl } from "../../../../util/documentation-url";
import { showEnergySettingsThermalDialog } from "../dialogs/show-dialogs-energy";
import "./ha-energy-validation-result";
import { energyCardStyles } from "./styles";

@customElement("ha-energy-thermal-settings")
export class EnergyThermalSettings extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false })
  public preferences!: EnergyPreferences;

  @property({ attribute: false })
  public statsMetadata?: Record<string, StatisticsMetaData>;

  @property({ attribute: false })
  public validationResult?: EnergyPreferencesValidation;

  protected render(): TemplateResult {
    const thermalSources: ThermalSourceTypeEnergyPreference[] = [];
    const thermalValidation: EnergyValidationIssue[][] = [];

    this.preferences.energy_sources.forEach((source, idx) => {
      if (source.type !== "thermal") {
        return;
      }
      thermalSources.push(source);

      if (this.validationResult) {
        thermalValidation.push(this.validationResult.energy_sources[idx]);
      }
    });
    return html`
      <ha-card>
        <h1 class="card-header">
          <ha-svg-icon .path=${mdiHeatingCoil}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.energy.thermal.title")}
        </h1>

        <div class="card-content">
          <p>
            ${this.hass.localize("ui.panel.config.energy.thermal.sub")}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href=${documentationUrl(this.hass, "/docs/energy/thermal/")}
              >${this.hass.localize("ui.panel.config.energy.thermal.learn_more")}</a
            >
          </p>
          ${thermalValidation.map(
            (result) => html`
              <ha-energy-validation-result
                .hass=${this.hass}
                .issues=${result}
              ></ha-energy-validation-result>
            `
          )}
          ${
            thermalSources.length > 0
              ? html`
                  <div class="items-container">
                    ${thermalSources.map((source) => {
                      const entityState =
                        this.hass.states[source.stat_energy_from];
                      return html`
                        <div class="row" .source=${source}>
                          ${
                            entityState?.attributes.icon
                              ? html`<ha-icon
                                  .icon=${entityState.attributes.icon}
                                ></ha-icon>`
                              : html`<ha-svg-icon
                                  .path=${mdiHeatingCoil}
                                ></ha-svg-icon>`
                          }
                          <span class="content"
                            >${
                              source.name ||
                              getStatisticLabel(
                                this.hass,
                                source.stat_energy_from,
                                this.statsMetadata?.[source.stat_energy_from]
                              )
                            }</span
                          >
                          <ha-icon-button
                            .label=${this.hass.localize(
                              "ui.panel.config.energy.thermal.edit_thermal_source"
                            )}
                            @click=${this._editSource}
                            .path=${mdiPencil}
                          ></ha-icon-button>
                          <ha-icon-button
                            .label=${this.hass.localize(
                              "ui.panel.config.energy.thermal.delete_thermal_source"
                            )}
                            @click=${this._deleteSource}
                            .path=${mdiDelete}
                          ></ha-icon-button>
                        </div>
                      `;
                    })}
                  </div>
                `
              : ""
          }
          <div class="row">
            <ha-button @click=${this._addSource} appearance="filled" size="s">
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon
              >${this.hass.localize(
                "ui.panel.config.energy.thermal.add_thermal_source"
              )}</ha-button
            >
          </div>
        </div>
      </ha-card>
    `;
  }

  private _addSource() {
    showEnergySettingsThermalDialog(this, {
      statsMetadata: this.statsMetadata,
      thermal_sources: this.preferences.energy_sources.filter(
        (src) => src.type === "thermal"
      ) as ThermalSourceTypeEnergyPreference[],
      saveCallback: async (source) => {
        //delete source.unit_of_measurement;
        await this._savePreferences({
          ...this.preferences,
          energy_sources: this.preferences.energy_sources.concat(source),
        });
      },
    });
  }

  private _editSource(ev) {
    const origSource: ThermalSourceTypeEnergyPreference =
      ev.currentTarget.closest(".row").source;
    showEnergySettingsThermalDialog(this, {
      source: { ...origSource },
      statsMetadata: this.statsMetadata,
      thermal_sources: this.preferences.energy_sources.filter(
        (src) => src.type === "thermal"
      ) as GasSourceTypeEnergyPreference[],
      saveCallback: async (newSource) => {
        await this._savePreferences({
          ...this.preferences,
          energy_sources: this.preferences.energy_sources.map((src) =>
            src === origSource ? newSource : src
          ),
        });
      },
    });
  }

  private async _deleteSource(ev) {
    const sourceToDelete: ThermalSourceTypeEnergyPreference =
      ev.currentTarget.closest(".row").source;

    if (
      !(await showConfirmationDialog(this, {
        title: this.hass.localize("ui.panel.config.energy.delete_source"),
      }))
    ) {
      return;
    }

    try {
      await this._savePreferences({
        ...this.preferences,
        energy_sources: this.preferences.energy_sources.filter(
          (source) => source !== sourceToDelete
        ),
      });
    } catch (err: any) {
      showAlertDialog(this, { title: `Failed to save config: ${err.message}` });
    }
  }

  private async _savePreferences(preferences: EnergyPreferences) {
    const result = await saveEnergyPreferences(this.hass, preferences);
    fireEvent(this, "value-changed", { value: result });
  }

  static get styles(): CSSResultGroup {
    return [haStyle, energyCardStyles];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-energy-thermal-settings": EnergyThermalSettings;
  }
}
