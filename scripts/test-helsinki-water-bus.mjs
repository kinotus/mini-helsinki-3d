import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {buildWaterBusData} from './build-helsinki-water-bus.mjs';

const routes = JSON.parse(fs.readFileSync(
    new URL('../data-raw/vesibussireitit_EPSG3879.geojson', import.meta.url)
));
const piers = JSON.parse(fs.readFileSync(
    new URL('../data-raw/vesibussilaiturit_EPSG3879.geojson', import.meta.url)
));

test('water bus build projects and preserves the supplied Helsinki data', () => {
    const output = buildWaterBusData(routes, piers);
    const lineParts = output.routes.features.reduce((count, feature) =>
        count + feature.geometry.coordinates.length, 0);
    const vertices = output.routes.features.reduce((count, feature) =>
        count + feature.geometry.coordinates.reduce((sum, line) => sum + line.length, 0), 0);

    assert.equal(output.routes.features.length, 16);
    assert.equal(output.piers.features.length, 40);
    assert.equal(lineParts, 43);
    assert.equal(vertices, 6253);
    assert.ok(output.routes.features.every(feature =>
        feature.geometry.type === 'MultiLineString'
    ));
    assert.ok(output.piers.features.every(feature =>
        feature.geometry.type === 'Point'
    ));
    assert.equal(output.routes.crs, undefined);
    assert.equal(output.piers.crs, undefined);
    assert.equal(output.routes.features[0].properties.name, 'Läntinen saaristoreitti');
    assert.equal(output.piers.features[0].properties.name, 'Valkosaaren laituri');
});

test('water bus output uses Helsinki WGS84 longitude and latitude', () => {
    const output = buildWaterBusData(routes, piers);
    const coordinates = [
        ...output.routes.features.flatMap(feature =>
            feature.geometry.coordinates.flat()
        ),
        ...output.piers.features.map(feature => feature.geometry.coordinates)
    ];

    assert.ok(coordinates.every(([longitude, latitude]) =>
        longitude > 24.5 && longitude < 25.5 &&
        latitude > 59.8 && latitude < 60.5
    ));
});

test('water bus build rejects malformed route and pier inputs', () => {
    const invalidRoute = structuredClone(routes);
    invalidRoute.features[0].geometry.coordinates[0] = [invalidRoute.features[0].geometry.coordinates[0][0]];
    assert.throws(
        () => buildWaterBusData(invalidRoute, piers),
        /fewer than two coordinates/
    );

    const invalidPier = structuredClone(piers);
    delete invalidPier.features[0].properties.karttanimi;
    assert.throws(
        () => buildWaterBusData(routes, invalidPier),
        /missing karttanimi/
    );

    const duplicateId = structuredClone(piers);
    duplicateId.features[1].properties.id = duplicateId.features[0].properties.id;
    assert.throws(
        () => buildWaterBusData(routes, duplicateId),
        /duplicate id/
    );

    const unsupportedGeometry = structuredClone(routes);
    unsupportedGeometry.features[0].geometry.type = 'Polygon';
    assert.throws(
        () => buildWaterBusData(unsupportedGeometry, piers),
        /must be a LineString or MultiLineString/
    );

    const invalidCoordinate = structuredClone(piers);
    invalidCoordinate.features[0].geometry.coordinates[0] = Infinity;
    assert.throws(
        () => buildWaterBusData(routes, invalidCoordinate),
        /invalid 2D EPSG:3879 coordinate/
    );

    const zeroLengthSegment = structuredClone(routes);
    zeroLengthSegment.features[0].geometry.coordinates[0][1] =
        zeroLengthSegment.features[0].geometry.coordinates[0][0];
    assert.throws(
        () => buildWaterBusData(zeroLengthSegment, piers),
        /zero-length segment/
    );
});
