/**
 * Logic for rendering the map component of the visualization.
 * 
 * @license BSD 3 Clause
 * @author Regents of University of California / The Eric and Wendy Schmidt
 *      Center for Data Science and the Environment at UC Berkeley.
 */

// Geographic centers for the different regions to be used in the projection.
const CENTERS = {
    "AI": [-170.2, 52.2],
    "BSS": [-175.5, 57],
    "EBS": [-177, 58.5],
    "GOA": [-153.26, 57],
    "NBS": [-176, 63]
};

// Recommended scaling factor for different regions to be used in the
// projection.
const SCALES = {
    "AI": 1500,
    "BSS": 1100,
    "EBS": 950,
    "GOA": 900,
    "NBS": 1200
};

// Recommended rotations for the different regions to be used in the projection.
const ROTATIONS = {
    "AI": [1,0],
    "BSS": [-1, -0.3],
    "EBS": [-1, -0.3],
    "GOA": [-1, -0.3],
    "NBS": [-1, -0.3]
}

// Color to use for the square indicating that a haul took place but no
// temperature information to show.
const PRESENCE_INDICATOR_COLOR = "#0570b0";


/**
 * Representation of a single geohash for a single survey / species / year.
 */
class MapDatum {

    /**
     * Create new information about a geohash.
     * 
     * @param {string} geohash The geohash as a string.
     * @param {number} x The x coordinate in visualization pixel space.
     * @param {number} y The y coordinate in visualization pixel space.
     * @param {number} width The width of the geohash in visualization pixel
     *      space.
     * @param {number} height The height of the geohash in visualization pixel
     *      space.
     * @param {number} temperature The temperature in celcius reported for this
     *      geohash given the user's selections.
     * @param {number} cpue The catch per unit effort reported for this geohash
     *      given the user's selections.
     */
    constructor(geohash, x, y, width, height, temperature, cpue) {
        const self = this;

        self._geohash = geohash;
        self._x = x;
        self._y = y;
        self._width = width;
        self._height = height;
        self._temperature = temperature;
        self._cpue = cpue;
    }

    /**
     * Get the geohash string associated with this region.
     * 
     * @return {string} The geohash as a string.
     */
    getGeohash() {
        const self = this;

        return self._geohash;
    }

    /**
     * Get the horizontal pixel coordinate of this region.
     * 
     * @return {number} The x coordinate in visualization pixel space.
     */
    getX() {
        const self = this;

        return self._x;
    }

    /**
     * Get the vertical pixel coordinate of this region.
     * 
     * @return {number} The y coordinate in visualization pixel space.
     */
    getY() {
        const self = this;

        return self._y;
    }

    /**
     * Get the horizontal center pixel coordinate for this region.
     * 
     * @return {number} Get the horiztonal pixel coordinate from which fish
     *      markers should be drawn.
     */
    getCenterX() {
        const self = this;

        return self.getX() + self.getWidth() / 2;
    }

    /**
     * Get the vertical center pixel coordinate for this region.
     * 
     * @return {number} Get the vertical pixel coordinate from which fish
     *      markers should be drawn.
     */
    getCenterY() {
        const self = this;

        return self.getY() + self.getHeight() / 2;
    }

    /**
     * Get the horizontal size of this region in pixels.
     * 
     * @return {number} The width of the geohash in visualization pixel space.
     */
    getWidth() {
        const self = this;

        return self._width;
    }

    /**
     * Get the vertical size of this region in pixels.
     * 
     * @return {number} The height of the geohash in visualization pixel space.
     */
    getHeight() {
        const self = this;

        return self._height;
    }

    /**
     * Get the temperature or temperture change seen in this region.
     * 
     * @return {number} The temperature in celcius reported for this geohash
     *      given the user's selections.
     */
    getTemperature() {
        const self = this;

        return self._temperature;
    }

    /**
     * Get the kg / hectare reported for the speices of interest in this region.
     * 
     * @return {number} The catch per unit effort reported for this geohash
     *      given the user's selections.
     */
    getCpue() {
        const self = this;

        return self._cpue;
    }

}


class MapViz {

    constructor(element, displaySelection, commonScale, onRender,
        onGeohashEnter, onGeohashLeave) {
        const self = this;

        self._element = element;
        self._displaySelection = displaySelection;
        self._onRender = onRender;

        const svgElement = self._element.querySelector(".viz");
        self._selection = d3.select("#" + svgElement.id);

        self._commonScale = commonScale;

        self._onGeohashEnter = onGeohashEnter;
        self._onGeohashLeave = onGeohashLeave;

        self._cachedTempDataset = null;
        self._cachedFirstDataset = null;
        self._cachedSecondDataset = null;

        self._requestBuild();
    }

    updateSelection(displaySelection) {
        const self = this;

        self._displaySelection = displaySelection;
        self._redraw();
    }

    selectGeohash(geohash) {
        const self = this;

        const graphDescriptionInner = self._element.querySelector(
            ".graph-description-inner"
        );
        const positionDisplay = self._element.querySelector(
            ".position-hover-display"
        );
        const temperatureDisplay = self._element.querySelector(
            ".temperature-hover-display"
        );
        const species1Display = self._element.querySelector(
            ".species-1-hover-display"
        );
        const species2Display = self._element.querySelector(
            ".species-2-hover-display"
        );

        if (geohash === null) {
            positionDisplay.innerHTML = "";
            temperatureDisplay.innerHTML = "";
            species1Display.innerHTML = "";
            species2Display.innerHTML = "";
            graphDescriptionInner.style.display = "block";
            self._selection.selectAll(".hover-target").style("opacity", 0);
            return;
        }

        graphDescriptionInner.style.display = "none";

        const displayGeohash = () => {
            positionDisplay.innerHTML = "Geohash: " + geohash;
        };

        const findGeohash = (dataset) => {
            if (dataset === null) {
                return null;
            }
            
            const matching = dataset.filter(
                (x) => x.getGeohash() === geohash
            );
            
            if (matching.length == 0) {
                return null;
            }

            return matching[0];
        };
        
        const displayTemperature = () => {
            const matchingRecord = findGeohash(self._cachedTempDataset);

            if (matchingRecord === null) {
                return;
            }

            const secondSelect = self._displaySelection.getSpeciesSelection2();
            const isComparing = secondSelect.getIsActive();
            const prefix = isComparing ? "Change in temperature: " : "Temperature: ";
            const temperature = matchingRecord.getTemperature();
            const roundedTemp = Math.round(temperature * 10) / 10;
            const message = prefix + roundedTemp + " C";
            temperatureDisplay.innerHTML = message;
        };

        const displaySpecies = (dataset, element, speciesSelection) => {
            const matchingRecord = findGeohash(dataset);

            if (!speciesSelection.getIsActive()) {
                return;
            }

            const speciesDescription = [
                speciesSelection.getName(),
                "(" + speciesSelection.getYear() + ")"
            ].join(" ");

            if (matchingRecord === null) {
                element.innerHTML = speciesDescription + ": Not Surveyed";
                return;
            }

            const cpue = matchingRecord.getCpue();
            const roundedCpue = Math.round(cpue * 100) / 100;
            const cpueStr = roundedCpue + " kg/hectare";
            const message = speciesDescription + ": " + cpueStr;
            element.innerHTML = message;
        };

        displayGeohash();
        if (self._displaySelection.getTemperatureEnabled()) {
            displayTemperature();
        }
        displaySpecies(
            self._cachedFirstDataset,
            species1Display,
            self._displaySelection.getSpeciesSelection1()
        );
        displaySpecies(
            self._cachedSecondDataset,
            species2Display,
            self._displaySelection.getSpeciesSelection2()
        );

        self._selection.selectAll(".hover-target")
            .style("opacity", (x) => x.getGeohash() === geohash ? 1 : 0);
    }

    _requestBuild() {
        const self = this;

        self._selection.html("");
        const waterLayer = self._selection.append("g").classed("water", true);
        const negativeLayer = self._selection.append("g")
            .classed("negative-markers", true);
        const landLayer = self._selection.append("g").classed("land", true);
        const fishLayer1 = self._selection.append("g")
            .classed("fish", true)
            .classed("fish-1", true);
        const fishLayer2 = self._selection.append("g")
            .classed("fish", true)
            .classed("fish-2", true);
        const hoverLayer = self._selection.append("g").classed("hover", true);

        self._redraw();
    }

    _redraw() {
        const self = this;

        const getScaleAndRedraw = () => {
            self._commonScale.getScales().then(redrawInner);
        };

        const redrawInner = (scales) => {
            const selection1 = self._displaySelection.getSpeciesSelection1();
            const selection2 = self._displaySelection.getSpeciesSelection2();

            const temperatureMode = self._displaySelection.getTemperatureMode();
            const isTempDisabled = !self._displaySelection.getTemperatureEnabled();
            const secondDisabled = !selection2.getIsActive();
            const useComparison = !isTempDisabled && !secondDisabled;

            const radiusScale = scales.getRadiusScale();
            const waterScale = scales.getWaterScale(useComparison);

            const waterLayer = self._selection.select(".water");
            const hoverLayer = self._selection.select(".hover");
            const negativeLayer = self._selection.select(".negative-markers");
            const landLayer = self._selection.select(".land");
            const fishLayer2 = self._selection.select(".fish-2");
            const fishLayer1 = self._selection.select(".fish-1");

            const survey = self._displaySelection.getSurvey();
            const projection = self._buildProjection(survey);

            const cachedFirstRequestor = self._makeCachedRequestor(
                self._makeFutureDataRequest(survey, selection1)
            );

            let temperatureRequestor = null;;
            if (useComparison) {
                temperatureRequestor = self._makeFutureDataRequest(
                    survey,
                    selection1,
                    selection2
                );
            } else {
                temperatureRequestor = cachedFirstRequestor;
            }

            self._updateLegend(scales);

            self._requestLand()
                .then(self._makeFutureRenderLand(landLayer, projection))
                .then(temperatureRequestor)
                .then(self._makeFutureInterpretPoints(projection, temperatureMode))
                .then(self._makeFutureRenderWater(waterLayer, negativeLayer, projection, waterScale))
                .then(self._makeFutureAddHoverTargets(hoverLayer, projection))
                .then((dataset) => { self._cachedTempDataset = dataset; })
                .then(cachedFirstRequestor)
                .then(self._makeFutureInterpretPoints(projection, temperatureMode))
                .then(self._makeFutureRenderFish(fishLayer1, projection, radiusScale))
                .then((dataset) => { self._cachedFirstDataset = dataset; })
                .then(self._makeFutureDataRequest(survey, selection2))
                .then(self._makeFutureInterpretPoints(projection, temperatureMode))
                .then(self._makeFutureRenderFish(fishLayer2, projection, radiusScale))
                .then((dataset) => { self._cachedSecondDataset = dataset; })
                .then(() => self._hideLoading())
                .then(() => self._updateTitles())
                .then(() => self._onRender());
        }

        self._showLoading();
        setTimeout(getScaleAndRedraw, 500);
    }

    _updateTitles() {
        const self = this;

        const hasData = !self._selection.selectAll(".fish-marker").empty();

        const updateNoData = (hasData) => {
            const target = self._element.querySelector(".no-data-message");
            target.style.display = hasData ? "none": "block";
        };

        const getSpeciesDescription = (species) => {
            const year = "(" + species.getYear() + ")";
            const message = species.getName() + " " + year;
            return message;
        }

        const updateTitle = (hasData) => {
            const target = self._element.querySelector(
                ".graph-description-inner"
            );
            const prefix = self._displaySelection.getSurvey() + ": ";
            
            const firstSpecies = self._displaySelection.getSpeciesSelection1();
            const firstMessage = getSpeciesDescription(firstSpecies);

            const secondSpecies = self._displaySelection.getSpeciesSelection2();
            const secondMessage = getSpeciesDescription(secondSpecies);

            const isComparing = secondSpecies.getIsActive();

            const speciesMessages = [firstMessage];
            if (isComparing) {
                speciesMessages.push(secondMessage);
            }
            const speciesMessage = speciesMessages.join(" vs ");

            const temperatureMode = self._displaySelection.getTemperatureMode();
            let temperatureSuffix = ".";
            if (self._displaySelection.getTemperatureEnabled()) {
                let tempDescription = "";
                if (isComparing) {
                    tempDescription = [
                        "change in",
                        temperatureMode,
                        "(" + secondSpecies.getYear(),
                        "-",
                        firstSpecies.getYear() + ")"
                    ].join(" ");
                } else {
                    tempDescription = temperatureMode;
                }

                temperatureSuffix = [
                    " with",
                    tempDescription,
                    "temperatures."
                ].join(" ");
            }

            const fullMessage = prefix + speciesMessage + temperatureSuffix;
            target.textContent = fullMessage;
            target.style.display = hasData ? "block": "none";
        };

        updateNoData(hasData);
        updateTitle(hasData);
    }

    _makeCachedRequestor(innerRequestor) {
        const self = this;
        var cachedValue = null;
        return () => {
            return new Promise((resolve, reject) => {
                if (cachedValue !== null) {
                    resolve(cachedValue);
                    return;
                }

                innerRequestor().then((result) => {
                    cachedValue = result;
                    resolve(cachedValue);
                })
            });
        };
    }

    _showLoading() {
        const self = this;
        self._element.querySelector(".map-loading").style.display = "block";
    }

    _hideLoading() {
        const self = this;
        self._element.querySelector(".map-loading").style.display = "none";
    }

    _updateLegend(scales) {
        const self = this;

        const secondSelection = self._displaySelection .getSpeciesSelection2();
        const isComparing = secondSelection.getIsActive();
        const temperatureDisplayed = self._displaySelection.getTemperatureEnabled();

        const legendSelect = d3.select("#" + self._element.id)
            .select(".legend");

        const buildRadiusLegend = (tableSelect) => {
            const maxCpue = scales.getSummary().getMaxCpue();
            const step = Math.round(maxCpue / 4);
            const values = [0, 1, 2, 3, 4].map((x) => x * step);

            tableSelect.html("");
            
            const rows = tableSelect.selectAll("tr")
                .data(values)
                .enter()
                .append("tr");

            const svgs = rows.append("td").append("svg")
                .attr("width", 30)
                .attr("height", 30)

            const radiusScale = scales.getRadiusScale();
            svgs.append("ellipse")
                .classed("fish-marker", true)
                .classed("fish-1", true)
                .attr("cx", 15)
                .attr("cy", 15)
                .attr("rx", (x) => radiusScale(x))
                .attr("ry", (x) => radiusScale(x));

            rows.append("td").html((x) => x + " kg / hectare");
        };

        const buildGridLegend = (tableSelect, minTemperature, maxTemperature,
            waterScale) => {
            const spread = maxTemperature - minTemperature;
            const step = Math.round(spread / 3 * 10) / 10;
            const values = spread == 0 ? [0] : [0, 1, 2, 3].map(
                (x) => x * step + minTemperature
            );

            tableSelect.html("");
            
            const rows = tableSelect.selectAll("tr")
                .data(values)
                .enter()
                .append("tr");

            const svgs = rows.append("td").append("svg")
                .attr("width", 30)
                .attr("height", 30)

            svgs.append("rect")
                .classed("grid", true)
                .attr("x", 5)
                .attr("y", 5)
                .attr("width", 20)
                .attr("height", 20)
                .attr("fill", (x) => waterScale(x))
                .attr("opacity", 0.5);

            svgs.append("rect")
                .attr("x", 7)
                .attr("y", 7)
                .attr("width", 16)
                .attr("height", 16)
                .attr("fill", "rgba(0, 0, 0, 0)")
                .attr("stroke-dasharray", "1,1")
                .attr("stroke", "black")
                .attr("stroke-width", (x) => x < 0 ? 1: 0);

            rows.append("td").html((x) => (Math.round(x * 10) / 10) + " C");
        };

        const updatePresenceText = (target) => {
            if (isComparing) {
                target.html("Area in both surveys.");
            } else {
                target.html("Area surveyed.");
            }
        };

        const updateVisibility = () => {
            let showGridLegend = false;
            let showDivergingLegend = false;
            let showIndicator = false;

            if (temperatureDisplayed) {
                if (isComparing) {
                    showDivergingLegend = true;
                } else {
                    showGridLegend = true;
                }
            } else {
                showIndicator = true;
            }

            legendSelect.select(".grid-legend-holder").style(
                "display",
                showGridLegend ? "block" : "none"
            );
            legendSelect.select(".grid-diverging-legend-holder").style(
                "display",
                showDivergingLegend ? "block" : "none"
            );
            legendSelect.select(".grid-indicator-holder").style(
                "display",
                showIndicator ? "block" : "none"
            );
        };

        const summary = scales.getSummary();
        buildRadiusLegend(legendSelect.select(".radius-legend"));
        buildGridLegend(
            legendSelect.select(".grid-legend"),
            summary.getMinTemperature(),
            summary.getMaxTemperature(),
            scales.getWaterScale(false)
        );
        buildGridLegend(
            legendSelect.select(".grid-diverging-legend"),
            summary.getMinTemperatureDelta(),
            summary.getMaxTemperatureDelta(),
            scales.getWaterScale(true)
        );
        updatePresenceText(legendSelect.select(".presence-description"));
        updateVisibility();
    }

    _requestLand() {
        return fetch('/static/geojson/clipped.geojson').then((x) => x.json());
    }

    _makeFutureInterpretPoints(projection, temperatureMode) {
        return (dataset) => {
            const interpreted = dataset.map((target) => {
                const lowPoint = projection([
                    parseFloat(target['lngLowDegrees']),
                    parseFloat(target['latLowDegrees'])
                ]);

                const highPoint = projection([
                    parseFloat(target['lngHighDegrees']),
                    parseFloat(target['latHighDegrees'])
                ]);

                const nativeWidth = highPoint[0] - lowPoint[0];
                const offset = nativeWidth > 10;

                const x = lowPoint[0] + (offset ? 1 : 0);
                const y = lowPoint[1] + (offset ? 1 : 0);
                const width = highPoint[0] - lowPoint[0] - (offset ? 2 : 0);
                const height = lowPoint[1] - highPoint[1] - (offset ? 3 : 0);

                const weight = parseFloat(target["weightKg"]);
                const area = parseFloat(target["areaSweptHectares"])
                const cpue = weight / area;

                const temperature = {
                    "bottom": target["bottomTemperatureC"],
                    "surface": target["surfaceTemperatureC"],
                    "disabled": null
                }[temperatureMode];

                const geohash = target["geohash"];

                return new MapDatum(
                    geohash,
                    x,
                    y,
                    width,
                    height,
                    temperature,
                    cpue
                );
            });

            return interpreted;
        };
    }

    _makeFutureRenderLand(landLayer, projection) {
        const self = this;

        return (geojson) => {
            const generator = d3.geoPath().projection(projection);
            
            landLayer.html("");

            const path = landLayer.selectAll("path")
                .data(geojson.features)
                .enter()
                .append("path");

            path.attr("d", generator);

            return geojson;
        };
    }

    _makeFutureRenderWater(waterLayer, negativeLayer, projection, waterScale) {
        const self = this;

        const buildWaterTiles = (dataset) => {
            const bound = waterLayer.selectAll(".grid")
                .data(dataset, (datum) => datum.getGeohash());

            bound.exit().remove();

            const newRects = bound.enter()
                .append("rect")
                .classed("grid", true)
                .attr("x", (datum) => datum.getX())
                .attr("y", (datum) => datum.getY());

            const rects = waterLayer.selectAll(".grid");

            rects.transition()
                .attr("x", (datum) => datum.getX())
                .attr("y", (datum) => datum.getY())
                .attr("width", (datum) => datum.getWidth())
                .attr("height", (datum) => datum.getHeight())
                .attr("fill", (datum) => {
                    const temperature = datum.getTemperature();
                    if (temperature === null) {
                        return PRESENCE_INDICATOR_COLOR;
                    } else {
                        return waterScale(temperature);
                    }
                })
                .attr("stroke-width", (datum) => {
                    const temperature = datum.getTemperature();
                    return temperature < 0 ? 1 : 0;
                });
        };

        const buildNegativeIndicators = (dataset) => {
            negativeLayer.html("");
            const negativeMarkers = negativeLayer.selectAll(".grid")
                .data(
                    dataset.filter((datum) => datum.getTemperature() < 0),
                    (datum) => datum.getGeohash()
                )
                .enter()
                .append("rect")
                .classed("grid", true)
                .attr("x", (datum) => datum.getX() + 2)
                .attr("y", (datum) => datum.getY() + 2)
                .attr("width", (datum) => datum.getWidth() - 4)
                .attr("height", (datum) => datum.getHeight() - 4)
                .attr("stroke-dasharray", "1,1");
        };

        return (dataset) => {
            buildWaterTiles(dataset);
            buildNegativeIndicators(dataset);
            return dataset;
        };
    }

    _makeFutureAddHoverTargets(hoverLayer, projection) {
        const self = this;

        const builTiles = (dataset) => {
            hoverLayer.html("");
            hoverLayer.selectAll(".grid")
                .data(dataset, (datum) => datum.getGeohash())
                .enter()
                .append("rect")
                .classed("grid", true)
                .classed("hover-target", true)
                .attr("x", (datum) => datum.getX())
                .attr("y", (datum) => datum.getY())
                .attr("width", (datum) => datum.getWidth())
                .attr("height", (datum) => datum.getHeight())
                .on("mouseover", (event, datum) => {
                    self._onGeohashEnter(datum.getGeohash());
                })
                .on("mouseout", (event, datum) => {
                    self._onGeohashLeave(datum.getGeohash());
                });
        };

        return (dataset) => {
            builTiles(dataset);
            return dataset;
        };
    }

    _makeFutureRenderFish(layer, projection, radiusScale) {
        return (dataset) => {
            const datasetAllowed = dataset.filter(
                (x) => !isNaN(x.getCenterX())
            );

            const bound = layer.selectAll(".fish-marker")
                .data(datasetAllowed, (x) => x.getGeohash());

            bound.exit().remove();

            bound.enter()
                .append("ellipse")
                .attr("cx", (datum) => datum.getCenterX())
                .attr("cy", (datum) => datum.getCenterY())
                .classed("fish-marker", true);

            const markers = layer.selectAll(".fish-marker")
            markers.transition()
                .attr("cx", (datum) => datum.getCenterX())
                .attr("cy", (datum) => datum.getCenterY())
                .attr("rx", (datum) => radiusScale(datum.getCpue()))
                .attr("ry", (datum) => radiusScale(datum.getCpue()));

            return dataset;
        };
    }

    _buildProjection(survey) {
        const self = this;

        const vizElement = self._element.querySelector(".viz");
        const boundingBox = vizElement.getBoundingClientRect();
        const width = boundingBox.width;
        const height = boundingBox.height;

        const projection = d3.geoMercator()
            .center(CENTERS[survey])
            .scale(SCALES[survey])
            .translate([width/2,height/2])
            .clipExtent([[0, 0], [width, height]])
            .rotate(ROTATIONS[survey]);

        return projection;
    }

    _makeFutureDataRequest(survey, speciesSelection, secondSelection) {
        const self = this;

        return () => {
            return new Promise((resolve, reject) => {
                if (!speciesSelection.getIsActive()) {
                    resolve([]);
                    return;
                }

                const isDense = self._commonScale.getIsDense();
                const url = generateDownloadDataUrl(
                    survey,
                    speciesSelection,
                    secondSelection,
                    isDense ? 4 : 5
                );

                Papa.parse(url, {
                    header: true,
                    download: true,
                    complete: function(results) {
                        resolve(results.data);
                    }
                });
            });
        };
    }

}
