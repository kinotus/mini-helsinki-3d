import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import proj4 from 'proj4';

const ROUTE_COLOR = '#00b9e4';
const PIER_COLOR = '#007a97';
const EPSG3879 = '+proj=tmerc +lat_0=0 +lon_0=25 +k=1 +x_0=25500000 +y_0=0 ' +
    '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs +type=crs';
const transform = proj4(EPSG3879, WGS84);

function assertFeatureCollection(data, filename) {
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error(`${filename} must be a GeoJSON FeatureCollection`);
    }
}

function getSourceProperty(feature, property, filename, index) {
    const value = feature.properties && feature.properties[property];

    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${filename} feature ${index + 1} is missing ${property}`);
    }
    return value.trim();
}

function getSourceId(feature, filename, index, ids) {
    const id = feature.properties && feature.properties.id;

    if (id === undefined || id === null || String(id).trim() === '') {
        throw new Error(`${filename} feature ${index + 1} is missing id`);
    }
    const key = String(id);

    if (ids.has(key)) {
        throw new Error(`${filename} contains duplicate id "${key}"`);
    }
    ids.add(key);
    return key;
}

function transformPosition(position, filename, index) {
    if (!Array.isArray(position) || position.length !== 2 ||
        !position.every(Number.isFinite)) {
        throw new Error(`${filename} feature ${index + 1} has an invalid 2D EPSG:3879 coordinate`);
    }
    const coordinate = transform.forward(position);

    if (!coordinate.every(Number.isFinite) ||
        coordinate[0] < 24.5 || coordinate[0] > 25.5 ||
        coordinate[1] < 59.8 || coordinate[1] > 60.5) {
        throw new Error(`${filename} feature ${index + 1} produced an invalid WGS84 coordinate`);
    }
    return coordinate.map(value => Number(value.toFixed(7)));
}

function normalizeRouteGeometry(geometry, filename, index) {
    if (!geometry || !['LineString', 'MultiLineString'].includes(geometry.type)) {
        throw new Error(`${filename} feature ${index + 1} must be a LineString or MultiLineString`);
    }
    const sourceLines = geometry.type === 'LineString' ?
        [geometry.coordinates] : geometry.coordinates;

    if (!Array.isArray(sourceLines) || !sourceLines.length) {
        throw new Error(`${filename} feature ${index + 1} has no route geometry`);
    }
    return {
        type: 'MultiLineString',
        coordinates: sourceLines.map((line, lineIndex) => {
            if (!Array.isArray(line) || line.length < 2) {
                throw new Error(
                    `${filename} feature ${index + 1} line part ${lineIndex + 1} has fewer than two coordinates`
                );
            }
            const coordinates = line.map(position =>
                transformPosition(position, filename, index)
            );

            for (let i = 1; i < coordinates.length; i++) {
                if (coordinates[i][0] === coordinates[i - 1][0] &&
                    coordinates[i][1] === coordinates[i - 1][1]) {
                    throw new Error(
                        `${filename} feature ${index + 1} line part ${lineIndex + 1} has a zero-length segment`
                    );
                }
            }
            return coordinates;
        })
    };
}

function normalizeRoutes(data, filename) {
    const ids = new Set();

    assertFeatureCollection(data, filename);
    return {
        type: 'FeatureCollection',
        metadata: {
            sourceCrs: 'EPSG:3879',
            targetCrs: 'CRS84'
        },
        features: data.features.map((feature, index) => {
            const sourceId = getSourceId(feature, filename, index, ids);

            return {
                type: 'Feature',
                id: `water-bus-route.${sourceId}`,
                geometry: normalizeRouteGeometry(feature.geometry, filename, index),
                properties: {
                    id: `water-bus-route.${sourceId}`,
                    sourceId,
                    featureType: 'water-bus-route',
                    name: getSourceProperty(feature, 'reitin_nimi', filename, index),
                    color: ROUTE_COLOR
                }
            };
        })
    };
}

function normalizePiers(data, filename) {
    const ids = new Set();

    assertFeatureCollection(data, filename);
    return {
        type: 'FeatureCollection',
        metadata: {
            sourceCrs: 'EPSG:3879',
            targetCrs: 'CRS84'
        },
        features: data.features.map((feature, index) => {
            const sourceId = getSourceId(feature, filename, index, ids);

            if (!feature.geometry || feature.geometry.type !== 'Point') {
                throw new Error(`${filename} feature ${index + 1} must be a Point`);
            }
            return {
                type: 'Feature',
                id: `water-bus-pier.${sourceId}`,
                geometry: {
                    type: 'Point',
                    coordinates: transformPosition(feature.geometry.coordinates, filename, index)
                },
                properties: {
                    id: `water-bus-pier.${sourceId}`,
                    sourceId,
                    featureType: 'water-bus-pier',
                    name: getSourceProperty(feature, 'karttanimi', filename, index),
                    color: PIER_COLOR
                }
            };
        })
    };
}

export function buildWaterBusData(routeData, pierData, routeFilename, pierFilename) {
    return {
        routes: normalizeRoutes(routeData, routeFilename || 'water bus routes'),
        piers: normalizePiers(pierData, pierFilename || 'water bus piers')
    };
}

function readJson(filename) {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function main() {
    const routeInput = path.resolve(process.argv[2] ||
        'data-raw/vesibussireitit_EPSG3879.geojson');
    const pierInput = path.resolve(process.argv[3] ||
        'data-raw/vesibussilaiturit_EPSG3879.geojson');
    const routeOutput = path.resolve(process.argv[4] ||
        'build/data/water-bus-routes.json');
    const pierOutput = path.resolve(process.argv[5] ||
        'build/data/water-bus-piers.json');
    const {routes, piers} = buildWaterBusData(
        readJson(routeInput),
        readJson(pierInput),
        path.relative(process.cwd(), routeInput),
        path.relative(process.cwd(), pierInput)
    );

    fs.mkdirSync(path.dirname(routeOutput), {recursive: true});
    fs.mkdirSync(path.dirname(pierOutput), {recursive: true});
    fs.writeFileSync(routeOutput, JSON.stringify(routes));
    fs.writeFileSync(pierOutput, JSON.stringify(piers));
    console.log(`Generated ${path.relative(process.cwd(), routeOutput)}`);
    console.log(`Generated ${path.relative(process.cwd(), pierOutput)}`);
    console.log(`Water bus routes: ${routes.features.length}`);
    console.log(`Water bus piers: ${piers.features.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
