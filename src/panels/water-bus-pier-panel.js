import {createElement, escapeHTML} from '../helpers/helpers';
import Panel from './panel';

const WATER_BUS_URL = 'https://www.hel.fi/fi/kulttuuri-ja-vapaa-aika/ulkoilu-puistot-ja-luontokohteet/saaret/vesiliikenne';

export default class extends Panel {

    constructor(options) {
        super(Object.assign({className: 'water-bus-pier-panel'}, options));
    }

    addTo(map) {
        const me = this,
            pier = me._options.object,
            closeButton = createElement('button', {
                className: 'close-button',
                type: 'button',
                title: map.dict['close'] || 'Sulje',
                onclick: event => {
                    event.stopPropagation();
                    map.trackObject();
                }
            });

        closeButton.setAttribute('aria-label', map.dict['close'] || 'Sulje');
        super.addTo(map)
            .setTitle(escapeHTML(pier.properties.name))
            .setHTML([
                '<div class="water-bus-pier-kind">Vesibussilaituri</div>',
                '<p>Ajantasaiset reitit ja aikataulut löytyvät Helsingin kaupungin vesiliikennesivulta.</p>',
                `<a href="${WATER_BUS_URL}" target="_blank" rel="noopener noreferrer">`,
                'Vesiliikenteen reitit ja aikataulut ↗',
                '</a>'
            ].join(''))
            .setButtons([closeButton]);

        return me;
    }

}
