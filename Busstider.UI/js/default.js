// For an introduction to the Blank template, see the following documentation:
// http://go.microsoft.com/fwlink/?LinkId=232509
(function() {
    "use strict";

    // selectors
    var clockSelector = "#clock";
    var $clockPanel;

    var infoSelector = "#info";
    var $info;

    var panelSelector = "#main";
    var $panel;

    var eventAdded = false;

    var timeTableRowSelector = "[data-time-table-row]";

    var inputRowSelector = "[data-input-row]";

    var triggerSearchSelector = "[data-trigger-search]";

    var triggerReloadSelector = "[data-trigger-reload]";

    var searchResultrowSelector = "[data-search-result-row]";

    var settingsFile = {
        name: "settings.dat",
        file: {},
        configData: {
            realTimeApiKey: "",
            realTimeApiUrl: "",
            siteId: "",
            locationApiKey: "",
            defaultTimeout: 30000
        }
    };

    var nrOfApiRequests = 0;

    // Events
    var offlineTimer,
        realTimeTimer;

    var app = WinJS.Application;
    var activation = Windows.ApplicationModel.Activation;
    var realTimeApiUrl = "https://api.sl.se/api2/realtimedepartures.json?key=8e3c208fb4844bc3b2dc4c0729c229c5&timewindow=60&siteid=";
    var locationApiUrl = "https://api.sl.se/api2/typeahead.json?key=512f3897e2bc47f9bf58c1ddac0091e4&searchstring=";
    var defaultTimeout = 30000;
    // 20 min
    var errorTimeout = defaultTimeout * 2 * 20;

    var log = function(text) {
        var now = new Date().toLocaleTimeString();
        text = now + " " + text;
        console.log(text);
    };

    function getAppVersion() {
        var p = Windows.ApplicationModel.Package.current.id.version;
        return "v" + p.major + "." + p.minor + "." + p.build + "." + p.revision;
    }

    var setLastApiActon = function() {
        var now = new Date().toLocaleTimeString();
        $info.find("span").text(getAppVersion() + " Last: " + now);
    };

    var setNextTimer = function (callback, time) {
        var now = new Date();
        var next = new Date(now.getTime() + time).toLocaleTimeString();
        log("Next api request " + next);

        $info.find("span").append(" Next: " + next);
        realTimeTimer = setTimeout(callback, time);
    };

    var getHtmlTemplate = function(selector) {
        var $data = $(selector).clone();
        return $data.text();
    };

    var centerItemVerticaly = function($panel) {
        var bodyHeight = document.body.offsetHeight;
        var tiderHeight = $panel.outerHeight();
        var marginTop = (bodyHeight - tiderHeight) / 2;
        if (marginTop < 0) {
            marginTop = 0;
        }

        $panel.css("margin-top", marginTop);
    };

    var fitToScreen = function(html) {
        var $html;
        // Test the height

        if (html instanceof jQuery) {
            $html = html;
        } else {
            $html = $(html);
        }

        var $testHeightPanel = $("[data-test-height-container]");
        $testHeightPanel.empty();

        $testHeightPanel.append($html.clone());
        var bodyHeight = document.body.offsetHeight;
        var nextHeight = $testHeightPanel.outerHeight();
        if (nextHeight > bodyHeight) {
            $html.find(".fullWidth:last-child").remove();
            return fitToScreen($html);
        }
        $testHeightPanel.empty();

        return $html.html();
    };

    var renderWithMustach = function(selector, data) {
        $panel.empty();
        var $tableRow = getHtmlTemplate(selector);
        var html = Mustache.render($tableRow, data);
        fitToScreen(html);
        $panel.append(html);
    };

    var renderMessage = function(message) {
        renderWithMustach("[data-no-data-row]", message);
    };

    var getData = function(url, callback) {
        log("Api request nr " + ++nrOfApiRequests);
        WinJS.xhr({ url: url })
            .done(
                function complete(result) {
                    setLastApiActon();
                    callback(result.response);
                },
                function error(request) {
                    log(request);
                    callback({
                        StatusCode: -99,
                        Message: request
                    });
                },
                function progress(result) {
                });
    };

    var updateOfflineTimes = function() {
        var timesToUpdate = $("[data-time]");
        var now = new Date().getTime();
        $.each(timesToUpdate, function(index, item) {
            var $item = $(item);
            if ($item.text().indexOf(":") > 0) return;
            var time = $item.attr("data-time");
            var arrivailIn = parseInt((time - now) / 1000 / 60, 10);
            var text = arrivailIn === 0 ? "Nu" : arrivailIn + " min";
            $item.text(text);
        });
    };

    var setNextTimerEvent = function (tider, callback) {
        var nextTimeOut = defaultTimeout;
        try {
            var now = new Date().getTime();
            var startLiveCheck = 2 * defaultTimeout * 5;

            if (tider.length > 0) {
                var expectedTime = new Date(tider[0].ExpectedDateTime).getTime();
                var calcNextTimeOut = expectedTime - now;
                if (calcNextTimeOut > startLiveCheck) {
                    offlineTimer = setInterval(updateOfflineTimes, defaultTimeout);
                    nextTimeOut = calcNextTimeOut - startLiveCheck;
                }
            } else {
                nextTimeOut = startLiveCheck;
            }
        } catch (e) {
            log(e);
            renderMessage("Set next timer event. " + e);
            nextTimeOut = errorTimeout;
        } finally {
            setNextTimer(callback, nextTimeOut);
        }
    };

    var updateTimeTable = function() {
        try {
            // Stop the offline timer
            clearInterval(offlineTimer);
            clearInterval(realTimeTimer);

            getData(realTimeApiUrl, function(json) {
                json = JSON.parse(json);

                $panel.empty();

                // Error
                if (json.StatusCode !== 0) {
                    log(json.StatusCode + ", " + json.Message);
                    renderMessage(json.StatusCode + " " + json.Message);

                    setNextTimer(updateTimeTable, errorTimeout);
                    return;
                }
                var tider = json.ResponseData.Buses;

                tider.forEach(function(item, index) {
                    item.expectedTime = new Date(item.ExpectedDateTime).getTime();
                });


                if (tider.length !== 0) {
                    renderWithMustach(timeTableRowSelector, tider);
                } else {
                    var now = new Date().getTime();

                    renderMessage("Inga avgångar hittades före " + new Date(now + 30 * 60 * 1000 ).toLocaleTimeString());
                }

                // Next timeout
                setNextTimerEvent(tider, updateTimeTable);

                // Set top margin
                centerItemVerticaly($panel);
            });

        } catch (e) {
            log(e);
            renderMessage("Update time table. " + e);
            setNextTimer(updateTimeTable, errorTimeout);
        }
    };

    var openFile = function(inFile) {
        var dfd = new jQuery.Deferred();
        Windows.Storage.ApplicationData.current.localFolder.createFileAsync(inFile.name,
            Windows.Storage.CreationCollisionOption.openIfExists).then(function(file) {
            inFile.file = file;
            dfd.resolve();
        });
        return dfd.promise();
    };

    var readFile = function(file) {
        var dfd = new jQuery.Deferred();
        file.file.openAsync(Windows.Storage.FileAccessMode.readWrite).then(
            function(readStream) {
                var dataReader = new Windows.Storage.Streams.DataReader(readStream);
                dataReader.loadAsync(readStream.size).done(function(numBytesLoaded) {
                    var fileContent = dataReader.readString(numBytesLoaded);
                    dataReader.close();
                    dfd.resolve(JSON.parse(fileContent));
                });
            });
        return dfd.promise();
    };

    var writeFile = function(file) {
        var dfd = new jQuery.Deferred();
        Windows.Storage.FileIO.writeTextAsync(file.file, JSON.stringify(file.configData)).then(function() {
            dfd.resolve();
        });
        return dfd.promise();
    };

    var getSearchValue = function(value) {
        var url = locationApiUrl + value;
        getData(url, function(json) {
            json = JSON.parse(json);
            if (json.StatusCode === 0) {
                $panel.empty();
                var stations = json.ResponseData;
                renderWithMustach(searchResultrowSelector, stations);

                $(".search-result").on("click", function() {
                    var siteId = $("[data-id]", this).attr("data-id");
                    settingsFile.configData.siteId = siteId;

                    writeFile(settingsFile)
                        .then(function() {
                            startApp();
                        });
                });

                centerItemVerticaly($panel);
            }
        });
    };

    var renderGetInputData = function(tooltip, btnTxt, callback) {
        clearInterval(offlineTimer);
        clearInterval(realTimeTimer);
        var $inputRow = $(getHtmlTemplate(inputRowSelector));

        var $input = $inputRow.find("[data-input-text]");
        $input.attr("placeholder", tooltip);
        var $btn = $inputRow.find("[data-button]");
        $btn.text(btnTxt);

        $panel.empty();

        $btn.on("click", function() {
            var value = encodeURIComponent($input.val());
            callback(value);
        });

        $panel.append($inputRow);
        centerItemVerticaly($panel);
    };

    var renderGetStation = function() {
        renderGetInputData("Hållplats", "Sök", getSearchValue);
    };

    var initEvents = function() {

        if (eventAdded) return;
        $(triggerSearchSelector).on("click", function() {
            renderGetStation();
        });

        $(triggerReloadSelector).on("click", function() {
            updateTimeTable();
        });

        $clockPanel.on("click", function() {
            $info.toggle();
        });

        setInterval(function() {
            var now = new Date();
            $clockPanel.find("span").text(now.toLocaleTimeString());
        }, 1000);

        eventAdded = true;
    };

    var initVariables = function() {
        $info = $(infoSelector);
        $clockPanel = $(clockSelector);
        $panel = $(panelSelector);
    };

    var checkConfig = function() {
        var config = settingsFile.configData;
        if (config.siteId === null || config.siteId === "" || config.siteId <= 0) {
            renderGetStation();
            return false;
        } else if (config.realTimeApiUrl === null || config.realTimeApiUrl === "" | config.realTimeApiUrl !== realTimeApiUrl) {
            // renderGetInputData("API url", "Spara", function (url) {
            settingsFile.configData.realTimeApiUrl = realTimeApiUrl;
            writeFile(settingsFile);
            return false;
            //});
        }
        return true;
    };

    function startApp() {
        initVariables();
        initEvents();
        openFile(settingsFile)
            .then(function() {
                readFile(settingsFile)
                    .then(function(fileContent) {
                        settingsFile.configData = fileContent;
                        if (fileContent === "" || !checkConfig()) {
                        } else {
                            settingsFile.configData = fileContent;

                            realTimeApiUrl = settingsFile.configData.realTimeApiUrl + settingsFile.configData.siteId;

                            updateTimeTable();
                        }
                    });
            });
    };

    app.onactivated = function(args) {
        log("App start");
        if (args.detail.kind === activation.ActivationKind.launch) {
            if (args.detail.previousExecutionState !== activation.ApplicationExecutionState.terminated) {
                // TODO: This application has been newly launched. Initialize
                // your application here.
                startApp();
            } else {
                // TODO: This application has been reactivated from suspension.
                // Restore application state here.
                startApp();
            }
            args.setPromise(WinJS.UI.processAll());
        }
    };

    app.oncheckpoint = function(args) {
        // TODO: This application is about to be suspended. Save any state
        // that needs to persist across suspensions here. You might use the
        // WinJS.Application.sessionState object, which is automatically
        // saved and restored across suspension. If you need to complete an
        // asynchronous operation before your application is suspended, call
        // args.setPromise().
    };

    app.start();
})();