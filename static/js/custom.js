$(function () {
    'use strict'

    /* Settings. */

    const showSearchMarker = false // Show a marker on the map's scan location. Default: false.
    const isSearchMarkerMovable = false // Let the user move the scan location marker around. Doesn't do anything without --no-fixed-location. Default: false.
    const showLocationMarker = true // Show a marker on the visitor's location. Default: false.
    const isLocationMarkerMovable = false // Let the user move the visitor marker around. Default: false.
    const scaleByRarity = true // Enable scaling by rarity. Default: true.
    const upscalePokemon = false // Enable upscaling of certain Pokemon (upscaledPokemon and notify list). Default: false.
    const upscaledPokemon = [] // Add Pomon IDs separated by commas (e.g. [1, 2, 3]) to upscale icons. Default: [].
    const minZoomLevel = 13 // Minimum Zoom level (0-20) the map can have (Restricts how far the user can zoom out). Default: null.
    const maxZoomLevel = null // Maximum Zoom level (0-20) (how close the user can zoom in). Default: null.
    const mapBounds = [ // Boundaries of the viewable map
        [49.957193, 10.985878], // Top-Left corner
        [49.852362, 10.837129]  // Bottom-Right corner
    ]

    // Google Analytics property ID. Leave empty to disable.
    // Looks like 'UA-XXXXX-Y'.
    const analyticsKey = 'UA-114995883-1'

    // MOTD.
    const motdEnabled = true
    const motdTitle = 'MOTD'
    const motd = 'Hi there! This is an easily customizable MOTD with optional title!'

    // Only show every unique MOTD message once. If disabled, the MOTD will be
    // shown on every visit. Requires support for localStorage.
    // Updating only the MOTD title (and not the text) will not make the MOTD
    // appear again.
    const motdShowOnlyOnce = false

    // What pages should the MOTD be shown on? By default, homepage and mobile
    // pages.
    const motdShowOnPages = [
        '/',
        '/mobile'
    ]

    // Clustering! Different zoom levels for desktop vs mobile.
    const disableClusters = false // Default: false.
    const maxClusterZoomLevel = 14 // Default: 14.
    const maxClusterZoomLevelMobile = 14 // Default: 14.
    const clusterZoomOnClick = false // Default: false.
    const clusterZoomOnClickMobile = false // Default: false.
    const clusterGridSize = 60 // Default: 60.
    const clusterGridSizeMobile = 60 // Default: 60.

    // Process Pokemon in chunks to improve responsiveness.
    const processPokemonChunkSize = 100 // Default: 100.
    const processPokemonIntervalMs = 100 // Default: 100ms.
    const processPokemonChunkSizeMobile = 100 // Default: 100.
    const processPokemonIntervalMsMobile = 100 // Default: 100ms.


    /* Feature detection. */

    const hasStorage = (function () {
        var mod = 'RocketMap'
        try {
            localStorage.setItem(mod, mod)
            localStorage.removeItem(mod)
            return true
        } catch (exception) {
            return false
        }
    }())


    /* Do stuff. */
    const currentPage = window.location.pathname
    // Marker cluster might have loaded before custom.js.
    const isMarkerClusterLoaded = typeof window.markerCluster !== 'undefined' && !!window.markerCluster

    // Set custom Store values.
    Store.set('maxClusterZoomLevel', maxClusterZoomLevel)
    Store.set('clusterZoomOnClick', clusterZoomOnClick)
    Store.set('clusterGridSize', clusterGridSize)
    Store.set('processPokemonChunkSize', processPokemonChunkSize)
    Store.set('processPokemonIntervalMs', processPokemonIntervalMs)
    Store.set('scaleByRarity', scaleByRarity)
    Store.set('upscalePokemon', upscalePokemon)
    Store.set('upscaledPokemon', upscaledPokemon)
    Store.set('showSearchMarker', showSearchMarker)
    Store.set('isSearchMarkerMovable', isSearchMarkerMovable)
    Store.set('showLocationMarker', showLocationMarker)
    Store.set('isLocationMarkerMovable', isLocationMarkerMovable)

    if (typeof window.orientation !== 'undefined' || isMobileDevice()) {
        Store.set('maxClusterZoomLevel', maxClusterZoomLevelMobile)
        Store.set('clusterZoomOnClick', clusterZoomOnClickMobile)
        Store.set('clusterGridSize', clusterGridSizeMobile)
        Store.set('processPokemonChunkSize', processPokemonChunkSizeMobile)
        Store.set('processPokemonIntervalMs', processPokemonIntervalMsMobile)
    }

    if (disableClusters) {
        Store.set('maxClusterZoomLevel', -1)

        if (isMarkerClusterLoaded) {
            window.markerCluster.setMaxZoom(-1)
        }
    }

    // Map zoom setup.
    const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(mapBounds[1][0], mapBounds[1][1]), 
        new google.maps.LatLng(mapBounds[0][0], mapBounds[0][1])
    )

    map.addListener('center_changed', function() {
        // don't do anything if still inside bounds
        if (bounds.contains(map.getCenter())) {
            return
        }


        // create an error message to inform the user
        toastr.error("You can't view unscanned areas!", "Out of bounds!", {'preventDuplicates': true})

        var center = map.getCenter(),
            x = center.lat(),
            y = center.lng(),
            maxX = bounds.getNorthEast().lat(),
            maxY = bounds.getNorthEast().lng(),
            minX = bounds.getSouthWest().lat(),
            minY = bounds.getSouthWest().lng()

        // set new center coords to boundary edge coords
        if (x < minX) {x = minX}
        if (x > maxX) {x = maxX}
        if (y < minY) {y = minY}
        if (y > maxY) {y = maxY}

        map.panTo(new google.maps.LatLng(x, y))
    })

    map.setOptions({
        'minZoom': minZoomLevel,
        'maxZoom': maxZoomLevel
    })

    // Google Analytics.
    if (analyticsKey.length > 0) {
        window.ga = window.ga || function () {
            (ga.q = ga.q || []).push(arguments)
        }
        ga.l = Date.now
        ga('create', analyticsKey, 'auto')
        ga('send', 'pageview')
    }

    // Show MOTD.
    if (motdEnabled && motdShowOnPages.indexOf(currentPage) !== -1) {
        let motdIsUpdated = true

        if (hasStorage) {
            const lastMOTD = window.localStorage.getItem('lastMOTD') || ''

            if (lastMOTD === motd) {
                motdIsUpdated = false
            }
        }

        if (motdIsUpdated || !motdShowOnlyOnce) {
            window.localStorage.setItem('lastMOTD', motd)

            swal({
                title: motdTitle,
                text: motd,
                buttons: false
            })
        }
    }

    // Default Pokémon exclusion list
    const totalExcluded = Store.get('remember_select_exclude') // Retrieve what has already been set.

    const excludedPokemon = [10, 11, 13, 14, 16, 19, 21, 46, 161, 163, 165, 166, 167, 177, 183, 184, 187, 220, 261, 262, 263, 264, 265, 276, 293, 316, 17, 20, 309] // Add Pokemon IDs separated by commas (e.g. [1, 2, 3])

    // If the new default Pokemon doesn't exist then add it to the list.
    excludedPokemon.forEach((id) => {
        if (totalExcluded.indexOf(id) === -1) {
            totalExcluded.push(id)
        }
    })

    Store.set('remember_select_exclude', totalExcluded) // Tell the script to store the value to set it.

    // Add Font Awesome 5 JS-Version
    $("head").prepend("<script defer src='https://use.fontawesome.com/releases/v5.0.8/js/all.js'></script>")

    // Disable spawnpoint & scanned location setting
    $("#spawnpoints-switch").parents("div.form-control.switch-container").remove()
    $("#scanned-switch").parents("div.form-control.switch-container").remove()

    Store.set('showSpawnpoints', false)
    Store.set('showScanned', false)

    // Remove status link
    $("span.label").filter(function(i) {
        return $(this).html() == "Status"
    }).parent().remove()

    // Remove Full Stats link
    $("nav#stats a").filter(function(i) { 
        return $(this).html() == "Full Stats" 
    }).remove()

    // Generates HeaderItems
    function genHeaderItem(innerHtml, iconClasses, outerAttrs) {
        if (outerAttrs === 'undefined') outerAttrs = {}
        if (innerHtml === 'undefined') innerHtml = "" 
        if (iconClasses === 'undefined') iconClasses = [] 

        var base = $("<a></a>")

        for (var k in outerAttrs) {
            base.attr(k, outerAttrs[k])
        }

        if (iconClasses.length > 0) {
            var icon = base.append("<i class='fa-fw itemIcon'>").append("<i><!--Buffer to avoid icon collision--></i>").find("i.itemIcon")
            iconClasses.forEach((cls) => {
                icon.addClass(cls)
            })
        }

        base.append(innerHtml).addClass("customHeaderItem")

        return base
    }

    // Add new items to header
    const $statsToggle = $("#header a#statsToggle") // "Stats" button in header
    
    // Set up Crypto SweetAlert content
    const cryptoAlertText = "Just send your digital coins to one of these addresses!<br><br><b>Bitcoin:</b><br><a target='_blank' href='bitcoin:36Kd3UjB4pmW2PtEMsFviyewVW4bD21eQZ'>36Kd3UjB4pmW2PtEMsFviyewVW4bD21eQZ</a><br><br><b>Bitcoin Cash:</b><br><a target='_blank' href='bitcoincash:pqjyatn5t6hy9j8s508gt35cat9a8fsmhcnfjt70xf'>pqjyatn5t6hy9j8s508gt35cat9a8fsmhcnfjt70xf</a>"
    const cryptoAlertContent = document.createElement("div")
    cryptoAlertContent.innerHTML = cryptoAlertText

    const toInsert = [ // Array of new items that should be inserted
        /*
            The items that will be inserted can be added as:
                - a jQuery object
                - a HTML string
            These are then inserted to the left side of the "Stats" button by default.
            If they should be inserted to the right side, put your HTML string/jQuery object into an array like this:
                [
                    "<p>Example</p>",
                    "right"
                ]
            
            The items will appear in the order they are in the array. (e.g. first item in array will be first item to the left of status toggle)
        */
        genHeaderItem("<span class='label'>Pokémon:&nbsp;</span><span class='counter'>0</span>", ["fas", "fa-map-marker-alt"], {"style": "float:right", "id":"pkmnCounter"}).click(
            () => { 
                $(this).find("#pkmnCounter span.counter").html(Object.keys(mapData.pokemons).length)
            }),
        genHeaderItem("<span class='label' style='display:none;'>Crypto</span>", ["fab", "fa-bitcoin"], {"style": "float:right;color:#ffe082", "id":"cryptoButton"}).hover(
            (e) => {
                //console.log("toggle paypal")
                $(this).find("#cryptoButton span.label").toggle("blind", {direction: "left"})
            }).click(
            () => {
                swal({content: cryptoAlertContent , title: "Support us with Crypto!", buttons: false})
            }),
        genHeaderItem("<span class='label' style='display:none;'>Paypal</span>", ["fab", "fa-paypal"], {"style": "float:right;color:#ffe082", "id":"paypalLink", "target":"_blank", "href":"https://www.paypal.me/PokeGoBamb/5"}).hover(
            (e) => {
                //console.log("toggle paypal")
                $(this).find("#paypalLink span.label").toggle("blind", {direction: "left"})
            }),
        genHeaderItem("<span class='label' style='display:none;'>Patreon</span>", ["fab", "fa-patreon"], {"style": "float:right;color:#ffe082", "id":"patreonLink", "target":"_blank", "href":"https://www.patreon.com/PokeGo"}).hover(
            (e) => {
                //console.log("toggle paypal")
                $(this).find("#patreonLink span.label").toggle("blind", {direction: "left"})
            }),
        "<a id='supportString' style='float:right'><span class='label'>Support us:</span></a>"
        //["<a style='float:right'>test</a>", "right"]
    ]

    toInsert.reverse().forEach((entry) => {
        var obj, mode
        if (typeof entry == "string") { // Convert strings to jQuery objects
            obj = $(entry)
        }
        else if (typeof entry == "object") {
            if (entry instanceof jQuery) { 
                obj = entry    
            } else {
                obj = entry[0]
                if (typeof obj == "string") {
                    obj = $(obj)
                }
                else if (!(obj instanceof jQuery)) {
                    obj = undefined
                }
                mode = entry[1]
            }    
        }

        if (obj == undefined) { // Do nothing if the entry is bad
            return
        }

        if (mode == undefined) { // Default is left
            mode = "left"
        }
        obj.addClass("customHeaderItem") // Add to "headerItem" class for dynamic hiding on page resize

        if (mode == "left") {
            obj.insertAfter($statsToggle)
        } 
        else if (mode == "right") {
            obj.insertBefore($statsToggle)
        }
    })


    // Update Pokémon Counter every 2 seconds
    window.setInterval(
        function() { 
            $("#pkmnCounter").click()
        }, 2000)

    window.extraItemsWidth = 8

    // Hide items if not enough space each time the site is resized
    function hideHeaderItems() {
        var headerSize = $("#header").outerWidth(true), itemsSize = 0

        $("#header").children().each((i, e) => {
            var item = $(e), w = item.outerWidth(true)
            
            var newItemsSize = itemsSize + w + extraItemsWidth
            
            if (newItemsSize >= headerSize) { // If items won't fit
                item.hide()
            } else {
                if (item.is(":hidden")) { // Reenable icon if previously hidden
                    item.show()
                } 
                itemsSize = newItemsSize
            }
        })
    }

    $(window).resize(() => {hideHeaderItems()}) // Run on resize
    $("#header").ready(hideHeaderItems()) // Run once when loaded

    // Login Prompt
    const swalLoginOptions = {
        title: "Not Authorized!",
        text: "Please provide your authentication key to access the map.\n\nIf you don't have one, head to our Patreon and become a Patron!",
        content: {
            element: "input",
            attributes: {
                type: "password",
                id: "loginForm"
            }
        },
        button: {
            text: "Sign in",
            closeModal: false
        },
        closeOnClickOutside: false,
        closeOnEsc: false
    }

    window['isLoginFormDisplaying'] = function () {
        // Login Form is displaying when the swal container is visible and an element with id loginForm exists
        return $("#loginForm").parent().parent().css("opacity") == "1"
    }
    window['displayLoginForm'] = function () {
        if (!isLoginFormDisplaying()) {
            swal(swalLoginOptions).then(key => {$.ajax({
                type: "POST",
                url: "/authenticate",
                data: "password="+key,
                success: function () {
                    swal({
                        icon: "success",
                        title: "Success!",
                        text: "Logging in was successful.",
                    })
                },
                error: function () {
                    swal({
                        icon: "error",
                        title: "Error!",
                        text: "Something has gone wrong, please try again later.",
                        content: {
                            element: "i",
                            attributes: {
                                id: "loginForm"
                            }
                        }
                    }).then(function () {
                            setTimeout(function () {
                                displayLoginForm()
                            }, 100)
                        })
                },
                statusCode: {
                    401: function () {
                        swal({
                            icon: "error",
                            title: "Invalid Key!",
                            text: "The key you tried to use is either invalid or has expired. Please try a different one.",
                            content: {
                                element: "i",
                                attributes: {
                                    id: "loginForm"
                                }
                            }
                        }).then(function () {
                            setTimeout(function () {
                                displayLoginForm()
                            }, 100)
                        })
                    }
                }
            })})
        }
    }

    // Add new options category
    const $navAccordion = $("nav#nav div#nav-accordion")

    function addNavCategory(title, iconClass, extraAttrs, append) {
        if (title === 'undefined') return
        if (extraAttrs === 'undefined' || (typeof extraAttrs != 'object')) extraAttrs = {}
        if (append === 'undefined' || (typeof append != 'boolean')) append = true

        var base = $("<h3></h3>").html(title)

        if (typeof iconClass == 'string') {
            base.prepend("<i class='" + iconClass + "'></i>")
        }

        base.attr(extraAttrs)
        base.addClass("customNavCategory")

        if (append) {
            $navAccordion.append(base)
            $navAccordion.append("<div></div>") // The accordion containing the switches
        } else {
            $navAccordion.prepend("<div></div>")
            $navAccordion.prepend(base)
        }

        return base
    }

    function addSettingsSwitch(navCategory, title, id, checked, changedHandler, extraAttrs, append, overrideHtml) {
        if (navCategory === 'undefined' || !(navCategory instanceof jQuery)) return
        if (title === 'undefined' || typeof title != 'string') return
        if (id === 'undefined' || typeof id != 'string') return
        if (append === 'undefined' || typeof append != 'boolean') append = true
        if (checked === 'undefined' || typeof checked != 'boolean') checked = false
        if (extraAttrs === 'undefined' || typeof extraAttrs != 'object') extraAttrs = {}

        var base = $("<div class='form-control switch-container customSwitchContainer'><div>").append(
                "<h3>" + title + "</h3>").append(
                "<div class='onoffswitch'></div>")

        var onOffSwitch = base.find("div.onoffswitch")
        onOffSwitch.append("<input id='" + id + "' type='checkbox' name='" + id + "' class='onoffswitch-checkbox customSwitch' checked>").append(
            "<label class='onoffswitch-label' for='" + id + "'></label>")

        var switchLabel = onOffSwitch.find("label.onoffswitch-label")
        switchLabel.append("<span class='switch-label' data-on='On' data-off='Off'></span>").append(
            "<span class='switch-handle'></span>")

        var input = onOffSwitch.find("input")

        if (typeof overrideHtml == 'string') { // Override html
            base.html(overrideHtml)
        }

        if (typeof changedHandler == "function") {
            input.change(changedHandler) // Set changedHandler
        }

        input.prop("checked", checked) // Flip switch to default position

        if (append) {
            navCategory.next().append(base)
        } else {
            navCategory.next().prepend(base)
        }

        return {switch: input, container: base}
    }

    const $additionalSettings = addNavCategory("Additional Settings", "fas fa-puzzle-piece fa-fw")


    // Restricted areas switch
    const polygonArray = [] // Stores all polygons that are created later

    // Mark restricted Areas
    
    // All restricted area polygons
    const restrictedCoords = {
            Muna: [
                    {lng: 10.937987, lat: 49.875123},
                    {lng: 10.939323, lat: 49.875484},
                    {lng: 10.939456, lat: 49.87556},
                    {lng: 10.940284, lat: 49.875816},
                    {lng: 10.941166, lat: 49.875862},
                    {lng: 10.941582, lat: 49.875975},
                    {lng: 10.941986, lat: 49.876115},
                    {lng: 10.942337, lat: 49.876264},
                    {lng: 10.943037, lat: 49.876629},
                    {lng: 10.943646, lat: 49.877045},
                    {lng: 10.943748, lat: 49.877155},
                    {lng: 10.943912, lat: 49.877321},
                    {lng: 10.944241, lat: 49.877581},
                    {lng: 10.944718, lat: 49.877847},
                    {lng: 10.944928, lat: 49.87795},
                    {lng: 10.945477, lat: 49.87815},
                    {lng: 10.945516, lat: 49.878163},
                    {lng: 10.945658, lat: 49.878213},
                    {lng: 10.946614, lat: 49.878562},
                    {lng: 10.946755, lat: 49.878727},
                    {lng: 10.946038, lat: 49.879453},
                    {lng: 10.945731, lat: 49.879651},
                    {lng: 10.945191, lat: 49.88},
                    {lng: 10.944445, lat: 49.880477},
                    {lng: 10.94346, lat: 49.881109},
                    {lng: 10.942751, lat: 49.881566},
                    {lng: 10.942383, lat: 49.881969},
                    {lng: 10.942333, lat: 49.882036},
                    {lng: 10.942116, lat: 49.882392},
                    {lng: 10.939847, lat: 49.884596},
                    {lng: 10.938234, lat: 49.885208},
                    {lng: 10.938191, lat: 49.885224},
                    {lng: 10.937773, lat: 49.885383},
                    {lng: 10.934659, lat: 49.886561},
                    {lng: 10.93434, lat: 49.887057},
                    {lng: 10.933652, lat: 49.888131},
                    {lng: 10.932987, lat: 49.889167},
                    {lng: 10.931869, lat: 49.889229},
                    {lng: 10.929808, lat: 49.889343},
                    {lng: 10.929778, lat: 49.889345},
                    {lng: 10.929664, lat: 49.889352},
                    {lng: 10.929095, lat: 49.889384},
                    {lng: 10.928942, lat: 49.889392},
                    {lng: 10.927745, lat: 49.889459},
                    {lng: 10.926836, lat: 49.88952},
                    {lng: 10.925812, lat: 49.889559},
                    {lng: 10.925046, lat: 49.88961},
                    {lng: 10.924305, lat: 49.889659},
                    {lng: 10.923613, lat: 49.889707},
                    {lng: 10.922921, lat: 49.889753},
                    {lng: 10.92252, lat: 49.889766},
                    {lng: 10.922302, lat: 49.889759},
                    {lng: 10.922299, lat: 49.889745},
                    {lng: 10.922243, lat: 49.889722},
                    {lng: 10.922212, lat: 49.889694},
                    {lng: 10.922196, lat: 49.889667},
                    {lng: 10.922191, lat: 49.889641},
                    {lng: 10.92221, lat: 49.889369},
                    {lng: 10.922203, lat: 49.889295},
                    {lng: 10.922202, lat: 49.889251},
                    {lng: 10.922208, lat: 49.889145},
                    {lng: 10.922237, lat: 49.888855},
                    {lng: 10.922263, lat: 49.888632},
                    {lng: 10.922283, lat: 49.888452},
                    {lng: 10.922301, lat: 49.888273},
                    {lng: 10.922318, lat: 49.888093},
                    {lng: 10.922328, lat: 49.887962},
                    {lng: 10.922331, lat: 49.887914},
                    {lng: 10.922345, lat: 49.887735},
                    {lng: 10.922355, lat: 49.887555},
                    {lng: 10.922365, lat: 49.887375},
                    {lng: 10.922388, lat: 49.886872},
                    {lng: 10.922395, lat: 49.886716},
                    {lng: 10.922869, lat: 49.886722},
                    {lng: 10.923618, lat: 49.88531},
                    {lng: 10.923787, lat: 49.884994},
                    {lng: 10.924206, lat: 49.885042},
                    {lng: 10.92522, lat: 49.885161},
                    {lng: 10.925598, lat: 49.883807},
                    {lng: 10.927608, lat: 49.884039},
                    {lng: 10.927861, lat: 49.884179},
                    {lng: 10.927933, lat: 49.884201},
                    {lng: 10.928019, lat: 49.884205},
                    {lng: 10.928108, lat: 49.884177},
                    {lng: 10.928178, lat: 49.884104},
                    {lng: 10.928223, lat: 49.883941},
                    {lng: 10.928321, lat: 49.882684},
                    {lng: 10.927376, lat: 49.882653},
                    {lng: 10.927468, lat: 49.881647},
                    {lng: 10.927827, lat: 49.881852},
                    {lng: 10.928032, lat: 49.881684},
                    {lng: 10.928377, lat: 49.881406},
                    {lng: 10.928535, lat: 49.881272},
                    {lng: 10.929306, lat: 49.88053},
                    {lng: 10.929326, lat: 49.880506},
                    {lng: 10.929442, lat: 49.880397},
                    {lng: 10.930277, lat: 49.879584},
                    {lng: 10.930325, lat: 49.879538},
                    {lng: 10.930344, lat: 49.87952},
                    {lng: 10.930674, lat: 49.879196},
                    {lng: 10.930713, lat: 49.879159},
                    {lng: 10.930964, lat: 49.878937},
                    {lng: 10.931045, lat: 49.878897},
                    {lng: 10.931713, lat: 49.87857},
                    {lng: 10.932544, lat: 49.878164},
                    {lng: 10.932611, lat: 49.878131},
                    {lng: 10.93314, lat: 49.877869},
                    {lng: 10.933596, lat: 49.87762},
                    {lng: 10.933995, lat: 49.877392},
                    {lng: 10.934452, lat: 49.877134},
                    {lng: 10.934791, lat: 49.876954},
                    {lng: 10.93564, lat: 49.876465},
                    {lng: 10.935824, lat: 49.87637},
                    {lng: 10.936079, lat: 49.876213},
                    {lng: 10.936552, lat: 49.875957},
                    {lng: 10.937084, lat: 49.875686},
                    {lng: 10.937402, lat: 49.875482},
                    {lng: 10.937437, lat: 49.87546},
                    {lng: 10.937693, lat: 49.875296},
                    {lng: 10.937987, lat: 49.875123}
            ],

            Schießplatz: [
                    {lng: 10.934549, lat: 49.894278},
                    {lng: 10.932387, lat: 49.893978},
                    {lng: 10.93116, lat: 49.89381},
                    {lng: 10.929926, lat: 49.893641},
                    {lng: 10.929247, lat: 49.893638},
                    {lng: 10.929437, lat: 49.892813},
                    {lng: 10.928941, lat: 49.892566},
                    {lng: 10.927881, lat: 49.892042},
                    {lng: 10.927598, lat: 49.891693},
                    {lng: 10.927076, lat: 49.891052},
                    {lng: 10.92673, lat: 49.89063},
                    {lng: 10.92612, lat: 49.889901},
                    {lng: 10.926027, lat: 49.88976},
                    {lng: 10.926165, lat: 49.889652},
                    {lng: 10.927151, lat: 49.889598},
                    {lng: 10.928193, lat: 49.889551},
                    {lng: 10.928244, lat: 49.88995},
                    {lng: 10.928664, lat: 49.89001},
                    {lng: 10.928826, lat: 49.890033},
                    {lng: 10.928884, lat: 49.89004},
                    {lng: 10.928901, lat: 49.890043},
                    {lng: 10.93011, lat: 49.890211},
                    {lng: 10.930194, lat: 49.890224},
                    {lng: 10.930381, lat: 49.890254},
                    {lng: 10.931741, lat: 49.890448},
                    {lng: 10.933048, lat: 49.890633},
                    {lng: 10.934403, lat: 49.890824},
                    {lng: 10.935699, lat: 49.891008},
                    {lng: 10.935313, lat: 49.892001},
                    {lng: 10.934928, lat: 49.892995},
                    {lng: 10.934549, lat: 49.894278}
            ],
             
            Kasernengel: [
                    {lng: 10.919198, lat: 49.907432},
                    {lng: 10.918959, lat: 49.907419},
                    {lng: 10.918959, lat: 49.907424},
                    {lng: 10.918244, lat: 49.907385},
                    {lng: 10.917827, lat: 49.907332},
                    {lng: 10.917585, lat: 49.907284},
                    {lng: 10.917453, lat: 49.907257},
                    {lng: 10.915385, lat: 49.90673},
                    {lng: 10.912462, lat: 49.905984},
                    {lng: 10.912828, lat: 49.904405},
                    {lng: 10.913084, lat: 49.902093},
                    {lng: 10.913085, lat: 49.902093},
                    {lng: 10.915107, lat: 49.902184},
                    {lng: 10.915274, lat: 49.902192},
                    {lng: 10.915599, lat: 49.902206},
                    {lng: 10.915844, lat: 49.902216},
                    {lng: 10.915834, lat: 49.90233},
                    {lng: 10.91583, lat: 49.902366},
                    {lng: 10.916125, lat: 49.902379},
                    {lng: 10.916032, lat: 49.903228},
                    {lng: 10.916026, lat: 49.903264},
                    {lng: 10.916236, lat: 49.903275},
                    {lng: 10.917328, lat: 49.903332},
                    {lng: 10.917697, lat: 49.903351},
                    {lng: 10.91778, lat: 49.903356},
                    {lng: 10.918313, lat: 49.903384},
                    {lng: 10.918818, lat: 49.90341},
                    {lng: 10.919026, lat: 49.903421},
                    {lng: 10.919233, lat: 49.903432},
                    {lng: 10.919442, lat: 49.903443},
                    {lng: 10.91965, lat: 49.903454},
                    {lng: 10.919859, lat: 49.903465},
                    {lng: 10.919854, lat: 49.903872},
                    {lng: 10.919845, lat: 49.904278},
                    {lng: 10.919858, lat: 49.904281},
                    {lng: 10.919854, lat: 49.90438},
                    {lng: 10.919845, lat: 49.904378},
                    {lng: 10.919831, lat: 49.904947},
                    {lng: 10.919842, lat: 49.904989},
                    {lng: 10.919848, lat: 49.905036},
                    {lng: 10.919849, lat: 49.905078},
                    {lng: 10.919843, lat: 49.905132},
                    {lng: 10.919775, lat: 49.905618},
                    {lng: 10.919762, lat: 49.905706},
                    {lng: 10.919679, lat: 49.906029},
                    {lng: 10.919445, lat: 49.906899},
                    {lng: 10.919357, lat: 49.907112},
                    {lng: 10.91929, lat: 49.907367},
                    {lng: 10.919198, lat: 49.907432}
            ],

            Kasernengel2: [
                    {lng: 10.933409, lat: 49.917529},
                    {lng: 10.932739, lat: 49.918033},
                    {lng: 10.931932, lat: 49.918669},
                    {lng: 10.930978, lat: 49.91934},
                    {lng: 10.930116, lat: 49.919942},
                    {lng: 10.929427, lat: 49.92034},
                    {lng: 10.92899, lat: 49.920639},
                    {lng: 10.927335, lat: 49.920068},
                    {lng: 10.927141, lat: 49.920061},
                    {lng: 10.926929, lat: 49.919991},
                    {lng: 10.926764, lat: 49.9199},
                    {lng: 10.925824, lat: 49.919614},
                    {lng: 10.925154, lat: 49.91939},
                    {lng: 10.925431, lat: 49.918974},
                    {lng: 10.925528, lat: 49.918829},
                    {lng: 10.925631, lat: 49.918673},
                    {lng: 10.925719, lat: 49.918542},
                    {lng: 10.926026, lat: 49.91808},
                    {lng: 10.925346, lat: 49.917892},
                    {lng: 10.924917, lat: 49.917773},
                    {lng: 10.924554, lat: 49.917673},
                    {lng: 10.924789, lat: 49.917317},
                    {lng: 10.924824, lat: 49.917268},
                    {lng: 10.924866, lat: 49.917207},
                    {lng: 10.924901, lat: 49.917157},
                    {lng: 10.924927, lat: 49.91712},
                    {lng: 10.924934, lat: 49.917077},
                    {lng: 10.925288, lat: 49.917089},
                    {lng: 10.925319, lat: 49.917086},
                    {lng: 10.925491, lat: 49.917059},
                    {lng: 10.925619, lat: 49.917034},
                    {lng: 10.92566, lat: 49.917026},
                    {lng: 10.925826, lat: 49.916987},
                    {lng: 10.925987, lat: 49.916942},
                    {lng: 10.926122, lat: 49.916907},
                    {lng: 10.926296, lat: 49.916834},
                    {lng: 10.926398, lat: 49.91679},
                    {lng: 10.926442, lat: 49.916771},
                    {lng: 10.926524, lat: 49.916731},
                    {lng: 10.926582, lat: 49.916703},
                    {lng: 10.926616, lat: 49.916684},
                    {lng: 10.926714, lat: 49.91663},
                    {lng: 10.92677, lat: 49.916596},
                    {lng: 10.926818, lat: 49.916628},
                    {lng: 10.926896, lat: 49.91658},
                    {lng: 10.927003, lat: 49.916506},
                    {lng: 10.927103, lat: 49.916427},
                    {lng: 10.927175, lat: 49.916349},
                    {lng: 10.92731, lat: 49.91619},
                    {lng: 10.927245, lat: 49.916172},
                    {lng: 10.927289, lat: 49.916121},
                    {lng: 10.927418, lat: 49.915909},
                    {lng: 10.927528, lat: 49.915696},
                    {lng: 10.927613, lat: 49.915477},
                    {lng: 10.927647, lat: 49.915251},
                    {lng: 10.927642, lat: 49.91502},
                    {lng: 10.927633, lat: 49.914954},
                    {lng: 10.927627, lat: 49.914903},
                    {lng: 10.927623, lat: 49.914869},
                    {lng: 10.92762, lat: 49.914835},
                    {lng: 10.927615, lat: 49.914784},
                    {lng: 10.927608, lat: 49.914698},
                    {lng: 10.928162, lat: 49.914858},
                    {lng: 10.928525, lat: 49.914337},
                    {lng: 10.928888, lat: 49.913815},
                    {lng: 10.929252, lat: 49.913294},
                    {lng: 10.927978, lat: 49.91293},
                    {lng: 10.927869, lat: 49.912899},
                    {lng: 10.927895, lat: 49.912858},
                    {lng: 10.927985, lat: 49.912726},
                    {lng: 10.928096, lat: 49.912562},
                    {lng: 10.928209, lat: 49.912397},
                    {lng: 10.92831, lat: 49.91225},
                    {lng: 10.928434, lat: 49.912069},
                    {lng: 10.928564, lat: 49.911879},
                    {lng: 10.928156, lat: 49.911765},
                    {lng: 10.928155, lat: 49.911767},
                    {lng: 10.928053, lat: 49.911738},
                    {lng: 10.928028, lat: 49.911731},
                    {lng: 10.927766, lat: 49.911657},
                    {lng: 10.927586, lat: 49.911607},
                    {lng: 10.927407, lat: 49.911556},
                    {lng: 10.92734, lat: 49.911537},
                    {lng: 10.927218, lat: 49.911503},
                    {lng: 10.927009, lat: 49.911444},
                    {lng: 10.926765, lat: 49.911375},
                    {lng: 10.9266, lat: 49.911328},
                    {lng: 10.92667, lat: 49.911225},
                    {lng: 10.926643, lat: 49.911217},
                    {lng: 10.926494, lat: 49.911175},
                    {lng: 10.926464, lat: 49.911178},
                    {lng: 10.92515, lat: 49.910807},
                    {lng: 10.925138, lat: 49.910798},
                    {lng: 10.925138, lat: 49.910784},
                    {lng: 10.926119, lat: 49.909305},
                    {lng: 10.925929, lat: 49.909251},
                    {lng: 10.923422, lat: 49.908538},
                    {lng: 10.923524, lat: 49.908389},
                    {lng: 10.922521, lat: 49.908106},
                    {lng: 10.922246, lat: 49.908028},
                    {lng: 10.921229, lat: 49.907738},
                    {lng: 10.921016, lat: 49.907678},
                    {lng: 10.920845, lat: 49.90763},
                    {lng: 10.920698, lat: 49.907595},
                    {lng: 10.920588, lat: 49.90757},
                    {lng: 10.920493, lat: 49.907551},
                    {lng: 10.920451, lat: 49.907544},
                    {lng: 10.920171, lat: 49.907491},
                    {lng: 10.920072, lat: 49.907477},
                    {lng: 10.919998, lat: 49.907468},
                    {lng: 10.919844, lat: 49.907451},
                    {lng: 10.919759, lat: 49.907372},
                    {lng: 10.920015, lat: 49.906574},
                    {lng: 10.920147, lat: 49.906052},
                    {lng: 10.920268, lat: 49.905519},
                    {lng: 10.920365, lat: 49.905087},
                    {lng: 10.920428, lat: 49.904525},
                    {lng: 10.920375, lat: 49.904512},
                    {lng: 10.920378, lat: 49.904413},
                    {lng: 10.920382, lat: 49.904352},
                    {lng: 10.920781, lat: 49.904457},
                    {lng: 10.920882, lat: 49.904484},
                    {lng: 10.921048, lat: 49.904528},
                    {lng: 10.921202, lat: 49.904568},
                    {lng: 10.921323, lat: 49.9046},
                    {lng: 10.921369, lat: 49.904614},
                    {lng: 10.921516, lat: 49.904658},
                    {lng: 10.921632, lat: 49.904692},
                    {lng: 10.921773, lat: 49.904734},
                    {lng: 10.921914, lat: 49.904774},
                    {lng: 10.922848, lat: 49.905006},
                    {lng: 10.923382, lat: 49.905138},
                    {lng: 10.923718, lat: 49.90522},
                    {lng: 10.923738, lat: 49.905225},
                    {lng: 10.923966, lat: 49.904902},
                    {lng: 10.924965, lat: 49.904928},
                    {lng: 10.925389, lat: 49.904939},
                    {lng: 10.925871, lat: 49.904951},
                    {lng: 10.926066, lat: 49.904609},
                    {lng: 10.926331, lat: 49.904142},
                    {lng: 10.926403, lat: 49.904016},
                    {lng: 10.926477, lat: 49.90394},
                    {lng: 10.926531, lat: 49.903889},
                    {lng: 10.927063, lat: 49.903367},
                    {lng: 10.927137, lat: 49.903374},
                    {lng: 10.927344, lat: 49.903393},
                    {lng: 10.927551, lat: 49.903412},
                    {lng: 10.927757, lat: 49.903431},
                    {lng: 10.927964, lat: 49.90345},
                    {lng: 10.928171, lat: 49.903469},
                    {lng: 10.928377, lat: 49.903488},
                    {lng: 10.928584, lat: 49.903508},
                    {lng: 10.928791, lat: 49.903527},
                    {lng: 10.928998, lat: 49.903546},
                    {lng: 10.929205, lat: 49.903565},
                    {lng: 10.929412, lat: 49.903584},
                    {lng: 10.92962, lat: 49.903603},
                    {lng: 10.929769, lat: 49.903617},
                    {lng: 10.929872, lat: 49.903646},
                    {lng: 10.929884, lat: 49.903627},
                    {lng: 10.930324, lat: 49.903666},
                    {lng: 10.930594, lat: 49.903697},
                    {lng: 10.930629, lat: 49.903697},
                    {lng: 10.930661, lat: 49.903692},
                    {lng: 10.930692, lat: 49.903684},
                    {lng: 10.930719, lat: 49.903673},
                    {lng: 10.93074, lat: 49.90366},
                    {lng: 10.930758, lat: 49.903645},
                    {lng: 10.930771, lat: 49.903629},
                    {lng: 10.930781, lat: 49.90361},
                    {lng: 10.930785, lat: 49.903592},
                    {lng: 10.930785, lat: 49.903573},
                    {lng: 10.930782, lat: 49.903559},
                    {lng: 10.930774, lat: 49.903544},
                    {lng: 10.930762, lat: 49.903527},
                    {lng: 10.930705, lat: 49.903454},
                    {lng: 10.930687, lat: 49.903429},
                    {lng: 10.930673, lat: 49.903404},
                    {lng: 10.930739, lat: 49.903127},
                    {lng: 10.930753, lat: 49.903129},
                    {lng: 10.930764, lat: 49.903084},
                    {lng: 10.930749, lat: 49.903083},
                    {lng: 10.930921, lat: 49.902364},
                    {lng: 10.930924, lat: 49.902356},
                    {lng: 10.930932, lat: 49.90235},
                    {lng: 10.931041, lat: 49.902306},
                    {lng: 10.931054, lat: 49.902299},
                    {lng: 10.931064, lat: 49.90229},
                    {lng: 10.931071, lat: 49.902274},
                    {lng: 10.931073, lat: 49.902274},
                    {lng: 10.93108, lat: 49.902275},
                    {lng: 10.932544, lat: 49.902397},
                    {lng: 10.934867, lat: 49.902618},
                    {lng: 10.936353, lat: 49.90276},
                    {lng: 10.937018, lat: 49.902847},
                    {lng: 10.937015, lat: 49.902865},
                    {lng: 10.937041, lat: 49.902864},
                    {lng: 10.937043, lat: 49.902849},
                    {lng: 10.937589, lat: 49.902939},
                    {lng: 10.937948, lat: 49.903041},
                    {lng: 10.937926, lat: 49.902978},
                    {lng: 10.938425, lat: 49.903082},
                    {lng: 10.938398, lat: 49.90313},
                    {lng: 10.938999, lat: 49.903246},
                    {lng: 10.939828, lat: 49.903518},
                    {lng: 10.941008, lat: 49.903923},
                    {lng: 10.94149, lat: 49.904096},
                    {lng: 10.941479, lat: 49.904122},
                    {lng: 10.94239, lat: 49.904294},
                    {lng: 10.942397, lat: 49.90437},
                    {lng: 10.942428, lat: 49.904431},
                    {lng: 10.942598, lat: 49.904529},
                    {lng: 10.942618, lat: 49.904532},
                    {lng: 10.942691, lat: 49.904579},
                    {lng: 10.942844, lat: 49.904804},
                    {lng: 10.942984, lat: 49.904957},
                    {lng: 10.943069, lat: 49.905124},
                    {lng: 10.943128, lat: 49.905187},
                    {lng: 10.943188, lat: 49.905235},
                    {lng: 10.943534, lat: 49.905455},
                    {lng: 10.943595, lat: 49.905501},
                    {lng: 10.943621, lat: 49.905541},
                    {lng: 10.943619, lat: 49.905591},
                    {lng: 10.943551, lat: 49.905877},
                    {lng: 10.943474, lat: 49.90607},
                    {lng: 10.943375, lat: 49.906273},
                    {lng: 10.943251, lat: 49.906481},
                    {lng: 10.94305, lat: 49.906776},
                    {lng: 10.942914, lat: 49.906994},
                    {lng: 10.942748, lat: 49.907281},
                    {lng: 10.942561, lat: 49.907541},
                    {lng: 10.941972, lat: 49.908308},
                    {lng: 10.941789, lat: 49.908562},
                    {lng: 10.94159, lat: 49.908869},
                    {lng: 10.941323, lat: 49.909306},
                    {lng: 10.941266, lat: 49.909416},
                    {lng: 10.941296, lat: 49.909479},
                    {lng: 10.941398, lat: 49.909539},
                    {lng: 10.941486, lat: 49.909574},
                    {lng: 10.940926, lat: 49.910243},
                    {lng: 10.940326, lat: 49.910904},
                    {lng: 10.939927, lat: 49.911412},
                    {lng: 10.939504, lat: 49.911905},
                    {lng: 10.938771, lat: 49.91267},
                    {lng: 10.938664, lat: 49.912728},
                    {lng: 10.938652, lat: 49.912747},
                    {lng: 10.938582, lat: 49.91281},
                    {lng: 10.938569, lat: 49.912829},
                    {lng: 10.938575, lat: 49.912918},
                    {lng: 10.938064, lat: 49.913466},
                    {lng: 10.93817, lat: 49.913502},
                    {lng: 10.938, lat: 49.913668},
                    {lng: 10.937848, lat: 49.913709},
                    {lng: 10.936939, lat: 49.914598},
                    {lng: 10.936988, lat: 49.914633},
                    {lng: 10.936408, lat: 49.915161},
                    {lng: 10.93627, lat: 49.915093},
                    {lng: 10.935194, lat: 49.916093},
                    {lng: 10.93444, lat: 49.916719},
                    {lng: 10.933409, lat: 49.917529}
            ],

            Flugplatz: [
                    {lng: 10.926938, lat: 49.921623},
                    {lng: 10.926786, lat: 49.921827},
                    {lng: 10.925901, lat: 49.922369},
                    {lng: 10.924881, lat: 49.922996},
                    {lng: 10.924733, lat: 49.923087},
                    {lng: 10.923924, lat: 49.923586},
                    {lng: 10.922928, lat: 49.924238},
                    {lng: 10.921855, lat: 49.924926},
                    {lng: 10.921109, lat: 49.92542},
                    {lng: 10.921066, lat: 49.925448},
                    {lng: 10.92029, lat: 49.92598},
                    {lng: 10.920107, lat: 49.925986},
                    {lng: 10.919566, lat: 49.925808},
                    {lng: 10.919583, lat: 49.925794},
                    {lng: 10.917643, lat: 49.925501},
                    {lng: 10.916036, lat: 49.925257},
                    {lng: 10.915503, lat: 49.925177},
                    {lng: 10.913592, lat: 49.924488},
                    {lng: 10.912548, lat: 49.924075},
                    {lng: 10.912313, lat: 49.923923},
                    {lng: 10.912238, lat: 49.92387},
                    {lng: 10.912082, lat: 49.923759},
                    {lng: 10.911822, lat: 49.923432},
                    {lng: 10.911531, lat: 49.922836},
                    {lng: 10.911355, lat: 49.92259},
                    {lng: 10.911282, lat: 49.922488},
                    {lng: 10.910946, lat: 49.922019},
                    {lng: 10.910408, lat: 49.921531},
                    {lng: 10.909788, lat: 49.921083},
                    {lng: 10.909189, lat: 49.920757},
                    {lng: 10.908961, lat: 49.92067},
                    {lng: 10.908474, lat: 49.920538},
                    {lng: 10.907722, lat: 49.920421},
                    {lng: 10.907151, lat: 49.920367},
                    {lng: 10.906838, lat: 49.920337},
                    {lng: 10.906399, lat: 49.920233},
                    {lng: 10.906344, lat: 49.920206},
                    {lng: 10.906292, lat: 49.920181},
                    {lng: 10.90615, lat: 49.920112},
                    {lng: 10.905911, lat: 49.919905},
                    {lng: 10.905785, lat: 49.919704},
                    {lng: 10.905751, lat: 49.91947},
                    {lng: 10.905888, lat: 49.918676},
                    {lng: 10.905869, lat: 49.918542},
                    {lng: 10.905928, lat: 49.918271},
                    {lng: 10.906023, lat: 49.917829},
                    {lng: 10.906023, lat: 49.917778},
                    {lng: 10.905999, lat: 49.917728},
                    {lng: 10.905902, lat: 49.917587},
                    {lng: 10.90594, lat: 49.91745},
                    {lng: 10.906009, lat: 49.917273},
                    {lng: 10.906096, lat: 49.917102},
                    {lng: 10.906199, lat: 49.916935},
                    {lng: 10.906317, lat: 49.916774},
                    {lng: 10.906454, lat: 49.916617},
                    {lng: 10.906604, lat: 49.916467},
                    {lng: 10.906768, lat: 49.916322},
                    {lng: 10.906949, lat: 49.916185},
                    {lng: 10.907143, lat: 49.916057},
                    {lng: 10.907518, lat: 49.915838},
                    {lng: 10.907589, lat: 49.915797},
                    {lng: 10.907655, lat: 49.915767},
                    {lng: 10.907721, lat: 49.915738},
                    {lng: 10.907787, lat: 49.91571},
                    {lng: 10.907855, lat: 49.915683},
                    {lng: 10.907935, lat: 49.915653},
                    {lng: 10.908016, lat: 49.915624},
                    {lng: 10.908098, lat: 49.915595},
                    {lng: 10.90818, lat: 49.915569},
                    {lng: 10.908264, lat: 49.915543},
                    {lng: 10.908348, lat: 49.915518},
                    {lng: 10.908434, lat: 49.915495},
                    {lng: 10.908521, lat: 49.915473},
                    {lng: 10.908608, lat: 49.915452},
                    {lng: 10.908696, lat: 49.915433},
                    {lng: 10.908785, lat: 49.915414},
                    {lng: 10.908875, lat: 49.915397},
                    {lng: 10.908965, lat: 49.915381},
                    {lng: 10.909056, lat: 49.915365},
                    {lng: 10.909147, lat: 49.915351},
                    {lng: 10.910202, lat: 49.915186},
                    {lng: 10.910261, lat: 49.915177},
                    {lng: 10.910321, lat: 49.915168},
                    {lng: 10.910382, lat: 49.915161},
                    {lng: 10.910441, lat: 49.915153},
                    {lng: 10.910501, lat: 49.915146},
                    {lng: 10.910561, lat: 49.91514},
                    {lng: 10.910621, lat: 49.915134},
                    {lng: 10.910681, lat: 49.91513},
                    {lng: 10.910741, lat: 49.915125},
                    {lng: 10.910802, lat: 49.915122},
                    {lng: 10.910863, lat: 49.915119},
                    {lng: 10.910924, lat: 49.915117},
                    {lng: 10.910985, lat: 49.915117},
                    {lng: 10.911046, lat: 49.915116},
                    {lng: 10.911107, lat: 49.915117},
                    {lng: 10.911169, lat: 49.915119},
                    {lng: 10.91123, lat: 49.915122},
                    {lng: 10.911291, lat: 49.915125},
                    {lng: 10.911352, lat: 49.915129},
                    {lng: 10.911413, lat: 49.915135},
                    {lng: 10.911473, lat: 49.915141},
                    {lng: 10.911534, lat: 49.915148},
                    {lng: 10.911594, lat: 49.915155},
                    {lng: 10.911654, lat: 49.915164},
                    {lng: 10.911713, lat: 49.915173},
                    {lng: 10.911772, lat: 49.915183},
                    {lng: 10.911831, lat: 49.915194},
                    {lng: 10.911889, lat: 49.915206},
                    {lng: 10.911947, lat: 49.915219},
                    {lng: 10.912005, lat: 49.915233},
                    {lng: 10.912067, lat: 49.915248},
                    {lng: 10.912129, lat: 49.915265},
                    {lng: 10.912191, lat: 49.915283},
                    {lng: 10.912239, lat: 49.915297},
                    {lng: 10.912287, lat: 49.915312},
                    {lng: 10.912287, lat: 49.915319},
                    {lng: 10.912333, lat: 49.915334},
                    {lng: 10.912379, lat: 49.91535},
                    {lng: 10.912424, lat: 49.915367},
                    {lng: 10.912468, lat: 49.915384},
                    {lng: 10.912527, lat: 49.915407},
                    {lng: 10.912586, lat: 49.915432},
                    {lng: 10.912643, lat: 49.915457},
                    {lng: 10.912699, lat: 49.915484},
                    {lng: 10.912914, lat: 49.915598},
                    {lng: 10.912965, lat: 49.915628},
                    {lng: 10.913015, lat: 49.91566},
                    {lng: 10.913064, lat: 49.915692},
                    {lng: 10.91311, lat: 49.915725},
                    {lng: 10.913148, lat: 49.915752},
                    {lng: 10.913185, lat: 49.915779},
                    {lng: 10.91322, lat: 49.915806},
                    {lng: 10.913254, lat: 49.915835},
                    {lng: 10.913287, lat: 49.915864},
                    {lng: 10.914088, lat: 49.916604},
                    {lng: 10.914887, lat: 49.917346},
                    {lng: 10.914982, lat: 49.917623},
                    {lng: 10.915236, lat: 49.918367},
                    {lng: 10.916071, lat: 49.918854},
                    {lng: 10.91689, lat: 49.919332},
                    {lng: 10.917531, lat: 49.919706},
                    {lng: 10.917716, lat: 49.919815},
                    {lng: 10.918169, lat: 49.920013},
                    {lng: 10.918638, lat: 49.920219},
                    {lng: 10.919446, lat: 49.920573},
                    {lng: 10.920483, lat: 49.921027},
                    {lng: 10.921239, lat: 49.921259},
                    {lng: 10.92196, lat: 49.921479},
                    {lng: 10.922497, lat: 49.920748},
                    {lng: 10.923035, lat: 49.920016},
                    {lng: 10.923091, lat: 49.919939},
                    {lng: 10.92313, lat: 49.919886},
                    {lng: 10.923143, lat: 49.919868},
                    {lng: 10.923157, lat: 49.919849},
                    {lng: 10.923266, lat: 49.9197},
                    {lng: 10.923552, lat: 49.919311},
                    {lng: 10.923632, lat: 49.919213},
                    {lng: 10.923644, lat: 49.919217},
                    {lng: 10.92376, lat: 49.919241},
                    {lng: 10.924124, lat: 49.919361},
                    {lng: 10.924953, lat: 49.919636},
                    {lng: 10.925295, lat: 49.919786},
                    {lng: 10.925836, lat: 49.920023},
                    {lng: 10.926321, lat: 49.920292},
                    {lng: 10.926421, lat: 49.9206},
                    {lng: 10.926428, lat: 49.92062},
                    {lng: 10.926522, lat: 49.920906},
                    {lng: 10.926729, lat: 49.920903},
                    {lng: 10.926799, lat: 49.921116},
                    {lng: 10.926674, lat: 49.921168},
                    {lng: 10.926938, lat: 49.921623}
            ],
    }

    // Set up InfoWindow
    const polygonsInfoWindow = new google.maps.InfoWindow
    polygonsInfoWindow.setContent("<p style='text-align:center;color:#ff0000'><i class='fas fa-exclamation-triangle'></i>&nbsp;&nbsp;<b style='color:#ff0000'>WARNING!</b>&nbsp;&nbsp;<i class='fas fa-exclamation-triangle'></i></p><b>This is a restricted area.<br>Trespassing could be dangerous!</b>")
    
    // Add Polygons
    for (var k in restrictedCoords) {
        var poly = new google.maps.Polygon({
            paths: restrictedCoords[k],
            strokeColor: '#FF0000',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#FF0000',
            fillOpacity: 0.35
        })
        
        poly.setMap(map)
        poly.addListener('click', (e) => { // Display InfoWindows when clicking on a polygon
            polygonsInfoWindow.setPosition(e.latLng)
            polygonsInfoWindow.open(map)
        })
        polygonArray.push(poly) // Add to polygonArray
    }

    // Set up switch for the polygons
    StoreOptions['showRestrictedAreas'] = { // Add key to Store
        default: true,
        type: StoreTypes.Boolean
    }

    const $switchRestrictedPolygons = addSettingsSwitch($additionalSettings, "Show Restricted Areas", "restArea-switch", Store.get('showRestrictedAreas'), function () { 
        console.log("triggered")
        console.log(this.checked)
        for (var k in polygonArray) {
            polygonArray[k].setVisible(this.checked)
        }
        Store.set('showRestrictedAreas', this.checked)
    }).switch
    $switchRestrictedPolygons.trigger("change") // Trigger change to hide polygons if switch is disabled

})